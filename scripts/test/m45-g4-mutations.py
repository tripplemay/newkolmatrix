#!/usr/bin/env python3
"""M4.5-AGENT-LOOP · Evaluator(G4) 变异测试台 — F004 / F008。

用途：证明 acceptance 断言是**承重**的（改坏实现必须翻红），而不是恒绿的装饰。
在只读 worktree 里逐个注入变异 → 跑目标测试文件 → 记录哪些文件翻红 → 还原。

前置：
    git worktree add --detach /tmp/m45-mut-G4 <被测SHA>
    ln -s <repo>/node_modules /tmp/m45-mut-G4/node_modules
    ln -s <repo>/.env         /tmp/m45-mut-G4/.env
    cp tests/unit/m45-g4-f008-progressive.probe.test.ts   /tmp/m45-mut-G4/tests/unit/
    cp tests/integration/m45-g4-f004-planack.probe.test.ts /tmp/m45-mut-G4/tests/integration/

运行：python3 scripts/test/m45-g4-mutations.py
结束后：git worktree remove /tmp/m45-mut-G4 --force
"""

import subprocess
import sys

WT = "/tmp/m45-mut-G4"

GEN_F004 = "tests/integration/propose-plan.test.ts"
GEN_F008 = "tests/unit/canvas-progressive.test.ts"
EVAL_F004 = "tests/integration/m45-g4-f004-planack.probe.test.ts"
EVAL_F008 = "tests/unit/m45-g4-f008-progressive.probe.test.ts"
ALL = [GEN_F004, GEN_F008, EVAL_F004, EVAL_F008]

# (id, 说明, 文件, 原文, 变异后)
MUTATIONS = [
    (
        "M1",
        "F004 服务端不再复核闸门（直接采信模型自报 needsGate）",
        "src/lib/agent/tools/propose-plan.ts",
        "    needsGate: item.needsGate || serverSaysGate,",
        "    needsGate: item.needsGate,",
    ),
    (
        "M2",
        "F004 低报不再被暴露（gateUnderreported 恒 false）",
        "src/lib/agent/tools/propose-plan.ts",
        "    gateUnderreported: serverSaysGate && !item.needsGate,",
        "    gateUnderreported: false,",
    ),
    (
        "M3",
        "F004 画布路由键失效（输出 type 改名）",
        "src/lib/agent/tools/propose-plan.ts",
        "    type: 'action_plan',\n    planId: row.id,",
        "    type: 'plan_v2' as 'action_plan',\n    planId: row.id,",
    ),
    (
        "M4",
        "F004 认可幂等失效（不查已有认可留痕，重复落行）",
        "src/lib/agent/plan-ack.ts",
        "  if (existing) {",
        "  if (existing && false) {",
    ),
    (
        "M5",
        "F004 认可端点越租户（where 去掉 tenantId）",
        "src/lib/agent/plan-ack.ts",
        "      id: planId,\n      tenantId: ctx.tenantId,",
        "      id: planId,",
    ),
    (
        "M6",
        "F004 认可端点限流被摘除",
        "src/app/api/agent/plan-ack/route.ts",
        "  const limited = agentRateLimitGuard(req);\n  if (limited) return limited;",
        "  const limited = null as Response | null;\n  if (limited) return limited;",
    ),
    (
        "M7",
        "F004 计划卡不再标「需你确认」（闸门披露被吞）",
        "src/components/copilot/canvas/PlanCard.tsx",
        "          {item.needsGate && (",
        "          {false && (",
    ),
    (
        "M8",
        "F004 未知工具不再标出（模型编的步骤看起来像真的）",
        "src/components/copilot/canvas/PlanCard.tsx",
        "          {!item.toolKnown && (",
        "          {false && (",
    ),
    (
        "M9",
        "F008 分支不再互斥（渐进分支抢在结果分支之前 → 产物到齐后仍回渐进卡）",
        "src/components/copilot/canvas/canvas-registry.tsx",
        "  if (state === 'output-available' && hasCanvasRenderer(toolName, output)) {",
        "  if (hasCanvasDraftRenderer(toolName)) {\n    return 'draft';\n  }\n  if (state === 'output-available' && hasCanvasRenderer(toolName, output)) {",
    ),
    (
        "M9b",
        "F008 渐进条件放宽到 output-available（**等价变异**：canvas 分支在前，此路不可达）",
        "src/components/copilot/canvas/canvas-registry.tsx",
        "    (state === 'input-streaming' || state === 'input-available') &&",
        "    (state === 'input-streaming' || state === 'input-available' || state === 'output-available') &&",
    ),
    (
        "M10",
        "F008 draft 类工具被误注册渐进器（越出裁决覆盖面）",
        "src/components/copilot/canvas/canvas-registry.tsx",
        "  if (!CANVAS_DRAFT_REGISTRY.has('propose_plan')) {",
        "  if (!CANVAS_DRAFT_REGISTRY.has('draft_report')) {\n    CANVAS_DRAFT_REGISTRY.set(\n      'draft_report',\n      PlanCardDraft as unknown as ComponentType<{ input: never }>,\n    );\n  }\n  if (!CANVAS_DRAFT_REGISTRY.has('propose_plan')) {",
    ),
    (
        "M11",
        "F008 空输入不再 early-return（空壳卡先闪一下再填满）",
        "src/components/copilot/canvas/PlanCardDraft.tsx",
        "  if (!title && items.length === 0) return null;",
        "  // mutated: 空壳照出",
    ),
    (
        "M12",
        "F008 渐进态展示模型自报闸门 —— **规避源码 grep**（字段名与文案都拼出来）",
        "src/components/copilot/canvas/PlanCardDraft.tsx",
        "            <span className=\"text-xs font-semibold text-navy-700 dark:text-white\">\n              {t}\n            </span>",
        "            <span className=\"text-xs font-semibold text-navy-700 dark:text-white\">\n              {t}\n              {(Array.isArray(input.items) &&\n              (input.items[i] as Record<string, unknown> | null)?.[\n                'needs' + 'Gate'\n              ]\n                ? '\\u9700' + '\\u4f60\\u786e\\u8ba4'\n                : '')}\n            </span>",
    ),
]


def run(cmd, cwd=WT):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)


def failing_files(out: str) -> list:
    return sorted({f for f in ALL if f"FAIL  {f}" in out or f"❯ {f}" in out})


def main() -> int:
    print(f"{'ID':<5}{'杀死断言的测试文件':<52}说明")
    print("-" * 120)
    survived = []
    for mid, desc, path, old, new in MUTATIONS:
        full = f"{WT}/{path}"
        with open(full, encoding="utf-8") as fh:
            src = fh.read()
        if old not in src:
            print(f"{mid:<5}{'!! 变异锚点未命中（实装已漂移）':<52}{desc}")
            survived.append(mid)
            continue
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(src.replace(old, new, 1))
        res = run(f"npx vitest run {' '.join(ALL)} --reporter=default 2>&1")
        out = res.stdout + res.stderr
        killers = failing_files(out)
        run(f"git checkout -- {path}")
        tag = "、".join(k.split("/")[-1] for k in killers) if killers else "**存活（无人拦）**"
        print(f"{mid:<5}{tag:<52}{desc}")
        if not killers:
            survived.append(mid)
    print("-" * 120)
    print(f"变异总数 {len(MUTATIONS)} · 被杀 {len(MUTATIONS)-len(survived)} · 存活 {len(survived)} {survived}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
