#!/usr/bin/env python3
"""M4.7-FRONTDESK · Evaluator G3 变异驱动器（F005 / F006 / F007）

用途：在只读 worktree（/tmp/m47-g3）里逐条注入变异，跑
  ① 仓内测试全集（实现者的断言，排除本 evaluator 探针）
  ② 本 evaluator 的独立探针（tests/integration/m47-g3-evaluator-probe.test.ts）
记录「谁翻红 / 谁没翻红」，并回收变异。

判据：acceptance 要求的「变异须翻红」指的是**仓内断言**要红；探针红仅说明
evaluator 自己抓得到，不能替代仓内覆盖。

用法：python3 scripts/test/m47-g3-mutation-driver.py [变异名...]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

WT = Path("/tmp/m47-g3")
PROBE = "tests/integration/m47-g3-evaluator-probe.test.ts"


@dataclass
class Mutation:
    name: str
    feature: str
    intent: str
    rel_path: str
    old: str
    new: str
    expect_repo_red: bool = True
    # 探针台账里需要回读的观测键（双向绑定实证）
    watch: list[str] = field(default_factory=list)


MUTATIONS: list[Mutation] = [
    # ── F005 ────────────────────────────────────────────────────────────
    Mutation(
        "A1-flag-false-subloop", "F005",
        "把 insufficientEvidence 在子 loop 出口改成恒 false",
        "src/lib/agent/specialist-loop.ts",
        "    insufficientEvidence: evidence.flag,",
        "    insufficientEvidence: false,",
    ),
    Mutation(
        "A2-flag-false-toolboundary", "F005",
        "把 insufficientEvidence 在**工具出口**（前台唯一看得见的那层）改成恒 false",
        "src/lib/agent/tools/consult-specialist.ts",
        "    insufficientEvidence: result.insufficientEvidence,",
        "    insufficientEvidence: false,",
    ),
    Mutation(
        "A3-drop-frontdesk-clause", "F005",
        "删掉前台 system 里的诚实条款注入",
        "src/lib/agent/system-assembly.ts",
        "    (persona.id === FRONT_DESK_AGENT_ID ? FRONT_DESK_HONESTY_CLAUSE : '')",
        "    ''",
    ),
    Mutation(
        "A4-synonym-evade-anchor", "F005",
        "条款改成近义表述（语义在、字面锚点没了）——M4.6 教训里被绕过的那种形态",
        "src/lib/agent/registry.ts",
        "  '**此时不得给出任何数值结论**，哪怕是\"大致\"\"约\"\"估计\"。',",
        "  '**此时请勿输出任何量化结果**，哪怕是\"大致\"\"约\"\"估计\"。',",
    ),
    Mutation(
        "A5-detector-shallow", "F005",
        "检出器只看浅层（嵌套产物漏检）",
        "src/lib/agent/specialist-loop.ts",
        "    if (depth > 8 || node === null || typeof node !== 'object') continue;",
        "    if (depth > 1 || node === null || typeof node !== 'object') continue;",
    ),
    Mutation(
        "A6-drop-reasons-toolboundary", "F005",
        "工具出口把「缺什么」清空（前台只知道不足、不知道缺口）",
        "src/lib/agent/tools/consult-specialist.ts",
        "    insufficientReasons: result.insufficientReasons,",
        "    insufficientReasons: [],",
    ),
    # ── F006 ────────────────────────────────────────────────────────────
    Mutation(
        "B1-const-consults-2to1", "F006",
        "常量 MAX_CONSULTS_PER_TURN 2→1（双向绑定实证）",
        "src/lib/agent/registry.ts",
        "export const MAX_CONSULTS_PER_TURN = 2;",
        "export const MAX_CONSULTS_PER_TURN = 1;",
        expect_repo_red=False,
        watch=["F006.successfulConsultsInOneTurn", "F006.MAX_CONSULTS_PER_TURN"],
    ),
    Mutation(
        "B2-const-specialist-3to2", "F006",
        "常量 SPECIALIST_MAX_STEPS 3→2（双向绑定实证）",
        "src/lib/agent/registry.ts",
        "export const SPECIALIST_MAX_STEPS = 3;",
        "export const SPECIALIST_MAX_STEPS = 2;",
        expect_repo_red=False,
        watch=["F006.specialistStepsObserved", "F006.SPECIALIST_MAX_STEPS"],
    ),
    Mutation(
        "B3-frontdesk-budget-extended", "F006",
        "前台步数档位 常规→深链（双向绑定实证：总顶应随之变）",
        "src/lib/agent/registry.ts",
        "    maxSteps: DEFAULT_MAX_STEPS,\n  },\n  {\n    id: 'strategy',",
        "    maxSteps: EXTENDED_MAX_STEPS,\n  },\n  {\n    id: 'strategy',",
        watch=[
            "F006.frontDeskStepsWhenConsultingDeepPersona",
            "F006.totalStepCeilingObserved",
        ],
    ),
    Mutation(
        "B4-remove-budget-check", "F006",
        "去掉咨询次数上限判据（无限咨询）",
        "src/lib/agent/tools/consult-specialist.ts",
        "  if (budget && budget.used >= budget.max) {",
        "  if (false && budget && budget.used >= budget.max) {",
    ),
    Mutation(
        "B5-fake-consulted-on-exhaust", "F006",
        "超限时假装咨询过（静默吞 + 编一个结论）——最不能接受的失败模式",
        "src/lib/agent/tools/consult-specialist.ts",
        "    throw new Error(`[consult-specialist] ${CONSULT_BUDGET_EXHAUSTED_MSG}`);",
        """    return {
      type: 'consultation',
      ok: true,
      agentId: input.targetAgent,
      answer: '（已咨询该专家，结论与前面一致）',
      toolNames: [],
      steps: 0,
      budgetHit: false,
      insufficientEvidence: false,
      insufficientReasons: [],
    };""",
    ),
    Mutation(
        "B6-telemetry-drop-consultcount", "F006",
        "遥测不再记 consultCount（恒 0）",
        "src/lib/agent/loop.ts",
        "        consultCount: consultBudget.used,",
        "        consultCount: 0,",
    ),
    Mutation(
        "B7-telemetry-leak-body", "F006",
        "遥测把工具入参正文塞进载荷（隐私边界回归）",
        "src/lib/agent/loop.ts",
        "        toolNames: event.steps.flatMap((s) =>\n          s.toolCalls.map((c) => c.toolName),\n        ),",
        "        toolNames: event.steps.flatMap((s) =>\n          s.toolCalls.map((c) => `${c.toolName}:${JSON.stringify(c.input)}`),\n        ),",
    ),
    # ── F007 ────────────────────────────────────────────────────────────
    Mutation(
        "C1-no-failure-trace", "F007",
        "咨询失败不留痕（线上无从归因）",
        "src/lib/agent/tools/consult-specialist.ts",
        "    await logConsultFailure(input.targetAgent, reason, ctx);",
        "    void reason;",
    ),
    Mutation(
        "C2-throw-through", "F007",
        "子 loop 失败抛穿（整场会话被带走）",
        "src/lib/agent/tools/consult-specialist.ts",
        "    const reason = err instanceof Error ? err.message : String(err);",
        "    throw err;\n    // eslint-disable-next-line no-unreachable\n    const reason = err instanceof Error ? err.message : String(err);",
    ),
    Mutation(
        "C3-silent-fallback", "F007",
        "失败静默降级为前台自答（假装咨询成功）",
        "src/lib/agent/tools/consult-specialist.ts",
        "      ok: false,\n      failureReason: reason,\n      agentId: input.targetAgent,\n      answer: '',",
        "      ok: true,\n      failureReason: undefined,\n      agentId: input.targetAgent,\n      answer: '专家确认：一切正常。',",
    ),
    Mutation(
        "C4-synonym-evade-failclause", "F007",
        "失败条款改近义表述（字面锚点失效）",
        "src/lib/agent/registry.ts",
        "  '咨询失败（ok 为假）时如实说明\"我问了但没拿到结果\"及原因，**不得用自己的猜测填补**，',",
        "  '咨询失败（ok 为假）时坦白说明未能取得回复及缘由，**请勿以主观推测补足**，',",
    ),
]


def run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=WT, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def repo_suite() -> tuple[bool, list[str]]:
    code, out = run(["npx", "vitest", "run", "--exclude", f"**/{Path(PROBE).name}"])
    failed = re.findall(r"^\s*(?:×|FAIL)\s+(.+)$", out, re.M)
    return code == 0, failed[:8]


def probe_run() -> tuple[bool, dict, list[str]]:
    code, out = run(["npx", "vitest", "run", PROBE])
    ledger: dict = {}
    m = re.search(r"\[G3 观测台账\] (\{.*?\n\})", out, re.S)
    if m:
        try:
            ledger = json.loads(m.group(1))
        except json.JSONDecodeError:
            ledger = {}
    failed = re.findall(r"^\s*(?:×|FAIL)\s+(.+)$", out, re.M)
    return code == 0, ledger, failed[:8]


def apply(mut: Mutation) -> None:
    f = WT / mut.rel_path
    src = f.read_text(encoding="utf8")
    if mut.old not in src:
        raise SystemExit(f"[{mut.name}] 锚点未命中: {mut.rel_path}")
    if src.count(mut.old) != 1:
        raise SystemExit(f"[{mut.name}] 锚点不唯一({src.count(mut.old)}): {mut.rel_path}")
    f.write_text(src.replace(mut.old, mut.new), encoding="utf8")


def revert(mut: Mutation) -> None:
    subprocess.run(["git", "checkout", "--", mut.rel_path], cwd=WT, check=True)


def main() -> None:
    picks = sys.argv[1:]
    todo = [m for m in MUTATIONS if not picks or m.name in picks]
    results = []
    for mut in todo:
        apply(mut)
        try:
            repo_green, repo_failed = repo_suite()
            probe_green, ledger, probe_failed = probe_run()
        finally:
            revert(mut)
        row = {
            "name": mut.name,
            "feature": mut.feature,
            "intent": mut.intent,
            "repo_suite": "GREEN(未翻红)" if repo_green else "RED(翻红)",
            "repo_failed_sample": repo_failed,
            "probe": "GREEN" if probe_green else "RED",
            "probe_failed_sample": probe_failed,
            "watched": {k: ledger.get(k) for k in mut.watch},
            "verdict": (
                "OK"
                if (not repo_green) == mut.expect_repo_red
                else "MISS(仓内断言抓不到)"
            ),
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    out = Path("/tmp/m47-g3-mutation-results.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8")
    print(f"\n[汇总] {out}")


if __name__ == "__main__":
    main()
