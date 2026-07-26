#!/usr/bin/env python3
"""M4.7-FRONTDESK 验收（G4）— 变异驱动器（Evaluator 产物）

在**隔离 worktree**（/tmp/m47-g4，detached @ 被测 SHA）里逐条施加变异、跑目标测试、
记录 RED/GREEN、还原。主工作树全程不动。

判据（写在这里，避免事后解释）：
  - expect=RED   变异后目标测试必须失败；若 GREEN → 该断言不设防（漏网）
  - expect=GREEN 变异后目标测试仍通过是**已知上限**（记为观察，不是缺陷）

用法： python3 scripts/test/m47-g4-mutation-driver.py [只跑某个 id]
"""

import subprocess
import sys
import os

WT = '/tmp/m47-g4'


def run(cmd, cwd=WT, timeout=900):
    p = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True,
                       text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr


def read(path):
    with open(os.path.join(WT, path), encoding='utf8') as f:
        return f.read()


def write(path, s):
    with open(os.path.join(WT, path), 'w', encoding='utf8') as f:
        f.write(s)


# (id, 说明, 文件, old, new, 目标测试命令, 期望)
MUTATIONS = [
    # ── F008 ────────────────────────────────────────────────────────────
    ('M-F008-1',
     '把「证据不足」标记从收起态移进展开区（作者自述的变异）',
     'src/components/copilot/canvas/ConsultationNote.tsx',
     """        {output.ok && output.insufficientEvidence && (
          <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            证据不足
          </span>
        )}
""",
     '',
     'npx vitest run tests/unit/consultation-note.test.ts',
     'RED'),

    ('M-F008-2',
     '标记留在收起态但用 hidden 类隐藏（样式层隐藏——作者已自陈的上限）',
     'src/components/copilot/canvas/ConsultationNote.tsx',
     '<span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">\n            证据不足',
     '<span className="hidden ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">\n            证据不足',
     'npx vitest run tests/unit/consultation-note.test.ts',
     'GREEN(已知上限)'),

    ('M-F008-3',
     '把痕迹里的专家名改成**别的专家**（match→触达专家）——痕迹说错是谁答的',
     'src/components/copilot/canvas/ConsultationNote.tsx',
     "  match: '匹配专家',",
     "  match: '触达专家',",
     'npx vitest run',
     'RED'),

    # ── F009 ────────────────────────────────────────────────────────────
    ('M-F009-1',
     '删掉 Handoff 清理步骤（软引用表不级联 → 必留孤儿行）',
     'scripts/test/frontdesk-e2e.ts',
     """    await cleanupStep('handoff(projectId = 夹具项目)', () =>
      prisma.handoff.deleteMany({
        where: { tenantId, projectId: fxProject.id },
      }),
    );
""",
     '',
     'npx tsx scripts/test/frontdesk-e2e.ts',
     'RED'),

    # ── F010 ────────────────────────────────────────────────────────────
    ('M-F010-1',
     '把「工具指引」段挪到知识段之前（S-M46-7 当初记录的绕过路径 R-MUT-9）',
     'src/lib/agent/system-assembly.ts',
     None,  # 特殊处理（见下）
     None,
     'npx vitest run tests/unit/architecture-doc-freshness.test.ts',
     'RED'),

    ('M-F010-2',
     '文档把子 Agent 调用状态回写「未实装」',
     'docs/dev/architecture.md',
     '| 状态 | `Handoff` 表 + `handoff.ts` 信封协议 ✅已建 | ✅ **as-built**',
     '| 状态 | `Handoff` 表 + `handoff.ts` 信封协议 ✅已建 | 未实装 —— specialist-loop',
     'npx vitest run tests/unit/architecture-doc-freshness.test.ts',
     'RED'),

    ('M-F010-3',
     '改成本常量（2→3）但不翻文档',
     'src/lib/agent/registry.ts',
     'export const MAX_CONSULTS_PER_TURN = 2;',
     'export const MAX_CONSULTS_PER_TURN = 3;',
     'npx vitest run tests/unit/architecture-doc-freshness.test.ts',
     'RED'),

    ('M-F010-4',
     '改前台 duty（职责文案）但不翻文档 —— 钉的是 isolation 还是 duty？',
     'src/lib/agent/registry.ts',
     "duty: '受理与综合·咨询专家·待办汇总',",
     "duty: '环节调度·专家编排·待办汇总',",
     'npx vitest run tests/unit/architecture-doc-freshness.test.ts',
     'RED'),

    # ── F011 ────────────────────────────────────────────────────────────
    ('M-F011-1',
     'S-M46-6 当初记录的绕过形态①：降级时编造 `${id} 星辰出海计划`',
     'src/lib/agent/project-context.ts',
     'const label = name ? `${resolvedId}（${name}）` : resolvedId;',
     'const label = name ? `${resolvedId}（${name}）` : `${resolvedId} 星辰出海计划`;',
     'npx vitest run tests/integration/project-context-injection.test.ts',
     'RED'),

    ('M-F011-2',
     'S-M46-6 当初记录的绕过形态②：`${id}【王者荣耀出海】`',
     'src/lib/agent/project-context.ts',
     'const label = name ? `${resolvedId}（${name}）` : resolvedId;',
     'const label = name ? `${resolvedId}（${name}）` : `${resolvedId}【王者荣耀出海】`;',
     'npx vitest run tests/integration/project-context-injection.test.ts',
     'RED'),

    ('M-F011-3',
     'S-RV1-1 当初记录的绕过路径：catch 里 `return Promise.reject(err)`（无 throw 关键字）',
     'scripts/test/cleanup-step.ts',
     """    console.error(
      `  ⚠ 清理步骤失败（不中断后续清理）：${label} — ${
        err instanceof Error ? err.message : err
      }`,
    );""",
     """    console.error(
      `  ⚠ 清理步骤失败（不中断后续清理）：${label} — ${
        err instanceof Error ? err.message : err
      }`,
    );
    return Promise.reject(err);""",
     'npx vitest run tests/unit/e2e-cleanup-hygiene.test.ts',
     'RED'),

    ('M-F011-4',
     'S-RV1-2 当初记录的绕过路径：清理段里**跨行**裸 deleteMany',
     'scripts/test/agentloop-e2e.ts',
     """    await cleanupStep('project(夹具项目)', () =>
      prisma.project.deleteMany({ where: { id: fxProject.id } }),
    );""",
     """    await prisma.project
      .deleteMany({ where: { id: fxProject.id } });""",
     'npx vitest run tests/unit/e2e-cleanup-hygiene.test.ts',
     'RED'),

    ('M-F011-5',
     'S-RV1-3 当初记录的绕过路径：`.filter(() => true)`（形式有 filter，实际不过滤）',
     'scripts/test/agentloop-e2e.ts',
     None,  # 特殊处理
     None,
     'npx vitest run tests/unit/e2e-cleanup-hygiene.test.ts',
     'RED'),

    ('M-F011-6',
     'O-G3-3：人格名单里写一个不存在的工具名（toAiSdkTools 静默 continue）',
     'src/lib/agent/registry.ts',
     "    tools: ['search_kols', 'get_kol_detail', 'match_plan', 'evaluate_creator'],",
     "    tools: ['search_kols', 'get_kol_detail', 'match_plan', 'evaluate_creatorX'],",
     'npx vitest run tests/unit/e2e-cleanup-hygiene.test.ts',
     'RED'),

    ('M-F011-7',
     'S-G5-6 当初记录的绕过路径：越权改调**别的**不可见工具（错误确实产生，但不是 create_project）',
     'scripts/test/agentloop-e2e.ts',
     "            { toolName: 'create_project', input: { name: 'e2e 越权项目' } },",
     "            { toolName: 'confirm_brief_goal', input: { projectId: 'x' } },",
     'npx tsx scripts/test/agentloop-e2e.ts',
     'RED'),
]


def apply_special(mid):
    """需要多点编辑的变异。"""
    if mid == 'M-F010-1':
        p = 'src/lib/agent/system-assembly.ts'
        s = read(p)
        # 把 toolLines 提到 knowledgeSection 之前
        old = """    projectSection +
    knowledgeSection +
    (toolLines.length
      ? `\\n\\n你可调用的工具（需要时主动调用，基于返回的真实数据作答）：\\n${toolLines.join(
          '\\n',
        )}`
      : NO_TOOL_CLAUSE) +"""
        new = """    projectSection +
    (toolLines.length
      ? `\\n\\n你可调用的工具（需要时主动调用，基于返回的真实数据作答）：\\n${toolLines.join(
          '\\n',
        )}`
      : NO_TOOL_CLAUSE) +
    knowledgeSection +"""
        assert old in s, 'M-F010-1 锚点未命中（拼接写法变了）'
        write(p, s.replace(old, new, 1))
        return p, s
    if mid == 'M-F011-5':
        p = 'scripts/test/agentloop-e2e.ts'
        s = read(p)
        import re
        m = re.search(r'const (\w+) = [\s\S]{0,400}?\.filter\(', s)
        assert m, '找不到 filter 声明'
        # 把真过滤换成恒真过滤
        old = """const pendingIds = rawPendingIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );"""
        assert old in s, '锚点未命中（filter 写法变了）'
        s2 = s.replace(
            old,
            'const pendingIds = rawPendingIds.filter(() => true) as string[];',
            1,
        )
        write(p, s2)
        return p, s
    raise AssertionError(mid)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    for (mid, desc, path, old, new, cmd, expect) in MUTATIONS:
        if only and only != mid:
            continue
        print(f'\n=== {mid} · {desc}')
        if old is None:
            path, orig = apply_special(mid)
        else:
            orig = read(path)
            assert old in orig, f'{mid}: 锚点未命中（{path}）—— 前提失效，须人工核对'
            write(path, orig.replace(old, new, 1))
        try:
            code, out = run(cmd)
        finally:
            write(path, orig)
        verdict = 'RED' if code != 0 else 'GREEN'
        mark = '✅符合预期' if verdict in expect else '⚠️不符预期'
        print(f'    → {verdict}（期望 {expect}）{mark}')
        tail = '\n'.join([l for l in out.splitlines()
                          if ('FAIL' in l or 'AssertionError' in l
                              or '✕' in l or 'Tests ' in l or 'ASSERT' in l)][:6])
        if tail:
            print('    ' + tail.replace('\n', '\n    '))
        results.append((mid, desc, verdict, expect, mark))

    print('\n\n==== 汇总 ====')
    for r in results:
        print(f'{r[0]:<12} {r[2]:<6} 期望={r[3]:<14} {r[4]}  {r[1]}')


if __name__ == '__main__':
    main()
