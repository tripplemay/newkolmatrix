#!/usr/bin/env python3
"""M4.7 对抗复核 · fix_round1 契约钉的变异自证驱动器。

用途：把「缺陷存在性证明」改写成「机制契约回归钉」之后，必须证明新断言不是恒真的——
摘掉哪个机制，就该有对应的钉子翻红。本驱动器在**隔离 worktree** 里逐条施加变异、
只跑本组探针、读回结果、还原。

用法：
  python3 scripts/test/m47-adv-mutation-driver.py            # 跑全部
  python3 scripts/test/m47-adv-mutation-driver.py MUT-A      # 只跑一条

纪律：只在 worktree 内改文件，主工作树零改动；每条变异跑完立即 `git checkout` 还原。
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass, field

WT = "/tmp/m47-adv2"
PROBES = [
    "tests/integration/m47-adv-probe.test.ts",
    "tests/integration/m47-adv-route-probe.test.ts",
]


@dataclass
class Mutation:
    id: str
    file: str
    desc: str
    # (正则, 替换) —— 施加在文件正文上
    subs: list[tuple[str, str]]
    # 期望翻红的用例名片段
    expect_red: list[str] = field(default_factory=list)


MUTATIONS: list[Mutation] = [
    Mutation(
        id="MUT-A",
        file="src/lib/agent/specialist-loop.ts",
        desc="摘掉子 loop 的墙钟闸（abortSignal）→ 挂死上游又变回无自限",
        subs=[
            (
                r"\n\s*abortSignal:\n\s*params\.abortSignal \?\?\n\s*AbortSignal\.timeout\([^)]*\),",
                "",
            )
        ],
        expect_red=["P9 子 loop 墙钟闸在场且生效"],
    ),
    Mutation(
        id="MUT-B",
        file="src/lib/agent/loop.ts",
        desc="摘掉撞顶回调（onBudgetExhausted 不再被调用）→ 撞顶重新变成静默",
        subs=[(r"params\.onBudgetExhausted\?\.\(\{", "void 0 || ((_x: unknown) => {})({")],
        expect_red=["P7 撞顶 → 服务端如实告知机制在场且生效"],
    ),
    Mutation(
        id="MUT-C",
        file="src/app/api/agent/route.ts",
        desc="route 恢复采信客户端 agentId（本批根因原样复发）",
        subs=[
            (
                r"return \{ route, projectId, env, agentId: FRONT_DESK_AGENT_ID, stage \};",
                "return { route, projectId, env, agentId: (isAgentId(String(raw.agentId ?? '')) ? (raw.agentId as never) : FRONT_DESK_AGENT_ID), stage };",
            ),
            (
                r"import \{\n  budgetExhaustedNotice,",
                "import {\n  isAgentId,\n  budgetExhaustedNotice,",
            ),
        ],
        expect_red=["P3 强制点已可被行为验证"],
    ),
    Mutation(
        id="MUT-D",
        file="src/app/api/agent/route.ts",
        desc="撞顶告知不再写进流（回调在、但 route 不落 data part）",
        subs=[(r"type: 'data-budget_notice',", "type: 'data-nothing_to_see_here',")],
        expect_red=["P7b 覆盖面不变式", "PR1"],
    ),
    Mutation(
        id="MUT-E",
        file="src/lib/ai/gateway.ts",
        desc="resilientFetch 把 signal 丢掉（闸在代码里、传不到 socket）",
        subs=[
            (
                r"const patchedInit = init\n\s*\? \{ \.\.\.init, keepalive: false, body: patchEmptyAssistantContent\(init\.body\) \}\n\s*: init;",
                "const patchedInit = init\n    ? { ...init, keepalive: false, signal: undefined, body: patchEmptyAssistantContent(init.body) }\n    : init;",
            )
        ],
        expect_red=["P9c 闸真的到达 socket"],
    ),

    Mutation(
        id="MUT-F",
        file="src/components/copilot/CopilotPanel.tsx",
        desc="摘掉面板的 budget_notice 渲染分支 → R-2 原样复发（写进流、没人渲染）",
        subs=[(r"if \(part\.type === BUDGET_NOTICE_PART\) \{", "if (false && part.type === ('' as never)) {")],
        expect_red=["P7b 覆盖面不变式"],
    ),
    Mutation(
        id="MUT-G",
        file="src/components/copilot/CopilotPanel.tsx",
        desc="渲染分支只匹配 type、不输出 notice 正文（空壳分支）",
        subs=[(r"\{notice\}\n", "{''}\n")],
        expect_red=["P7b 覆盖面不变式"],
    ),
    Mutation(
        id="MUT-H",
        file="src/lib/agent/loop.ts",
        desc="撞顶判据退回宽形态（只看步数）→ 自然收敛又被误报「我没答完」",
        subs=[(r"event\.steps\.length >= currentBudget\(\) &&\n\s*\(lastStep\?\.toolCalls\.length \?\? 0\) > 0;", "event.steps.length >= currentBudget();")],
        expect_red=["P7c 自然收敛恰好用满步数", "PR2 自然收敛"],
    ),
]


def run(cmd: list[str], cwd: str = WT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def restore(path: str) -> None:
    run(["git", "checkout", "--", path])


def apply(m: Mutation) -> bool:
    full = f"{WT}/{m.file}"
    with open(full, encoding="utf-8") as fh:
        src = fh.read()
    out = src
    for pattern, repl in m.subs:
        out, n = re.subn(pattern, repl, out, count=1)
        if n == 0:
            print(f"  ✗ 锚点未命中，变异未施加：{pattern[:60]}")
            return False
    with open(full, "w", encoding="utf-8") as fh:
        fh.write(out)
    return True


def probe_results(stdout: str) -> dict[str, str]:
    """从 vitest verbose 输出里读每条用例的绿/红。"""
    res: dict[str, str] = {}
    for line in stdout.splitlines():
        mark = line.strip()[:1]
        if mark not in {"✓", "×", "✗"}:
            continue
        name = line.strip()[1:].strip()
        res[name] = "GREEN" if mark == "✓" else "RED"
    return res


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    targets = [m for m in MUTATIONS if only is None or m.id == only]
    verdicts: list[tuple[str, str, str]] = []

    for m in targets:
        print(f"\n=== {m.id} · {m.desc}")
        # 变异前先把该文件还原到 fix 轮状态（worktree 里是"已改"的副本，
        # git checkout 会退回 HEAD —— 故先备份再手工还原）
        full = f"{WT}/{m.file}"
        with open(full, encoding="utf-8") as fh:
            backup = fh.read()
        try:
            if not apply(m):
                verdicts.append((m.id, "SKIP", "锚点未命中"))
                continue
            proc = run(
                ["npx", "vitest", "run", *PROBES, "--reporter=verbose", "--no-color"]
            )
            results = probe_results(proc.stdout)
            reds = [n for n, v in results.items() if v == "RED"]
            hit = [
                frag
                for frag in m.expect_red
                if any(frag in n for n in reds)
            ]
            # vitest 整体超时/崩溃也算红（挂死类变异会走这条）
            timed_out = "Test timed out" in proc.stdout or "Test timed out" in proc.stderr
            ok = len(hit) == len(m.expect_red) or (timed_out and m.expect_red)
            print(f"  翻红用例：{reds if reds else '(无)'}{' + 整体超时' if timed_out else ''}")
            verdicts.append(
                (m.id, "RED ✅" if ok else "GREEN ⚠", "; ".join(m.expect_red))
            )
        finally:
            with open(full, "w", encoding="utf-8") as fh:
                fh.write(backup)

    print("\n" + "=" * 72)
    print("变异自证矩阵（期望：每条都 RED —— 否则新钉子是恒真断言）")
    print("=" * 72)
    for mid, verdict, pin in verdicts:
        print(f"{mid:8} {verdict:10} 应翻红的钉子：{pin}")
    return 0 if all(v.startswith("RED") for _, v, _ in verdicts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
