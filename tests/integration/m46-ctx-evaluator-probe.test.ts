// M4.6-CTX F001 验收探针（Evaluator 独立编写，补作者未覆盖的两处取证面）
//
// ① **真 route 路径**：acceptance 明文「集成测经真 route 路径核实注入生效」，但作者的
//    9 条用例全部直接驱动 `runAgentLoop`（服务层），**无一经过 `src/app/api/agent/route.ts`
//    的 POST**——而 route 才是把 `body.context.projectId` 解析成 `copilot.projectId` 的那一层
//    （`resolveContext`，未导出、无用例）。同族先例：M4.5 F001 也是「acceptance 写 /api/agent、
//    用例只驱动 runAgentLoop」，由 evaluator 探针补上（tests/integration/m45-evaluator-loop-probe.test.ts）。
//    判据来源：framework/patterns/testing-env-patterns.md §8「服务层测试 ≠ HTTP 链测试」。
//
// ② **取名失败降级的「DB 故障」半边**：作者用例只覆盖「项目不存在」（findFirst 返回 null，
//    不进 catch）。Evaluator 独立变异实测：把 catch 改成 `return ''`（E-MUT-7）、或整块摘掉
//    try/catch 让它抛（E-MUT-8），作者 9 条用例**双双全绿**——acceptance 的「取名失败…且不抛」
//    这半边此前无任何断言。这里用 findFirst 抛错驱动真降级路径。
//
// 全程零外呼（fetch 哨兵）、零真实副作用；夹具租户按 pid 隔离，清理含 OperationLog / Handoff
//（二者对 Tenant 是**软引用无 FK**，删租户不会级联——漏清即留孤儿行）。

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';
import {
  NO_ASK_PROJECT_CLAUSE,
  PROJECT_CONTEXT_HEADING,
  projectContextSection,
} from '../../src/lib/agent/project-context';

/** vi.mock 工厂被提升到文件顶部 → 支点必须走 vi.hoisted。 */
const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as Array<{
    toolCalls?: Array<{ toolName: string; input?: unknown }>;
    text?: string;
  }>,
  fallback: undefined as { text?: string } | undefined,
  models: [] as Array<{ doStreamCalls: unknown[] }>,
}));

// route → runAgentLoop 不带 model / ctx（真实请求路径），故从模块层替换 chatModel 与
// buildToolContext；被测对象仍是产品的 route + loop 装配本体（注入缝纪律：传入即无条件用）。
vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return {
    ...actual,
    chatModel: () => {
      const m = scriptedModel(
        seam.script as ScriptedStep[],
        (seam.fallback as ScriptedStep) ?? { text: '（脚本用尽）' },
      );
      seam.models.push(m as unknown as { doStreamCalls: unknown[] });
      return m;
    },
  };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/context')>();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { POST } from '../../src/app/api/agent/route';

const FIXTURE_SLUG = `test-tenant-m46-evalprobe-${process.pid}`;
const FIXTURE_PROJECT_NAME = `m46-probe-项目-${process.pid}`;

let tenantId: string;
let projectId: string;

/** 取一次 provider 调用实际收到的 system 正文（模型那一步真看见的东西）。 */
function systemOf(call: unknown): string {
  const options = (call as { prompt: LanguageModelV4CallOptions['prompt'] })
    .prompt;
  const first = options.find((m) => m.role === 'system');
  if (!first) return '';
  const content = (first as { content: unknown }).content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/** 打一次真 /api/agent，返回响应元信息 + 模型每步收到的 system 实录。 */
async function postAgent(body: unknown, script: ScriptedStep[]) {
  seam.script = script;
  seam.models = [];
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text(); // 读完 = 流走完
    const systems = (seam.models[0]?.doStreamCalls ?? []).map(systemOf);
    return {
      status: res.status,
      agentIdHeader: res.headers.get('X-Agent-Id'),
      text,
      systems,
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: `M4.6 Evaluator 探针夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: FIXTURE_PROJECT_NAME },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: 'orchestrator',
    projectId,
    env: 'default',
  } satisfies ToolContext;
});

afterEach(() => {
  vi.restoreAllMocks(); // 只还原 spy，不动上面的模块级 vi.mock（那是注入缝）
});

afterAll(async () => {
  // 软引用表（无 FK、删租户不级联）必须显式清 —— 漏清就是每跑一次留一批孤儿行
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  // 遥测是 fire-and-forget，可能在上面删完之后才落地 → 兜一轮再清再断言
  await new Promise((r) => setTimeout(r, 600));
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  expect(
    await prisma.operationLog.count({ where: { tenantId } }),
    '夹具租户 OperationLog 残留（软引用表不级联，必须显式清）',
  ).toBe(0);
  expect(
    await prisma.handoff.count({ where: { tenantId } }),
    '夹具租户 Handoff 残留',
  ).toBe(0);
  expect(await prisma.tenant.count({ where: { slug: FIXTURE_SLUG } })).toBe(0);
});

describe('[Evaluator] F001 — 真 /api/agent route 全链（HTTP → resolveContext → loop）', () => {
  it('项目页请求：模型第一步收到的 system 含当前 projectId + 项目名 + 「不要索要」条款', async () => {
    const res = await postAgent(
      {
        prompt: '帮我看看这个项目该推进什么，然后分析下 ROI',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'match',
        },
      },
      [{ text: '好的。' }],
    );

    expect(res.status).toBe(200);
    expect(res.agentIdHeader).toBe('match');
    expect(res.networkCalls, '真 route 路径同样零外呼').toEqual([]);
    expect(res.systems.length, '模型至少被调一次').toBeGreaterThan(0);
    expect(
      res.systems[0],
      '经真 route 装配出的 system 缺当前 projectId —— 生产缺陷（模型反问「请提供项目ID」）正身',
    ).toContain(projectId);
    expect(res.systems[0]).toContain(PROJECT_CONTEXT_HEADING);
    expect(res.systems[0]).toContain(NO_ASK_PROJECT_CLAUSE);
    expect(res.systems[0], '有名字就写名字').toContain(FIXTURE_PROJECT_NAME);
    // 语义锚点（不引常量的同义反复）：真下发正文里必须出现「不要向用户索要」
    expect(res.systems[0]).toContain('不要向用户索要');
  });

  it('工作区层请求（body 不带 projectId）：真 route 也不注水', async () => {
    const res = await postAgent(
      { prompt: '今天该干什么', context: { route: '/admin/today' } },
      [{ text: '好的。' }],
    );
    expect(res.status).toBe(200);
    expect(res.systems[0]).not.toContain(PROJECT_CONTEXT_HEADING);
    expect(res.systems[0]).not.toContain(NO_ASK_PROJECT_CLAUSE);
    expect(res.systems[0], '人格段本体还在（不是空 system）').not.toBe('');
  });

  it('真 route 上发生接力：目标人格那一步的 system 同样带当前项目', async () => {
    const res = await postAgent(
      {
        prompt: '让洞察接手算一下 ROI',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'orchestrator',
        },
      },
      [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'm46-probe',
                summary: '请洞察接手做 ROI 复盘',
              },
            },
          ],
        },
        { text: '已交接。' },
      ],
    );

    expect(res.status).toBe(200);
    expect(res.networkCalls).toEqual([]);
    expect(
      res.systems.length,
      '接力后应还有一步（否则取不到目标人格的 system）',
    ).toBeGreaterThan(1);
    expect(res.systems[1], '接力后的 system 应已换人格').not.toBe(
      res.systems[0],
    );
    expect(
      res.systems[1],
      '接力后目标人格丢了当前项目 → 缺陷以「接手后又反问项目ID」复发',
    ).toContain(projectId);
    expect(res.systems[1]).toContain(NO_ASK_PROJECT_CLAUSE);
  });
});

describe('[Evaluator] F001 — 取名失败降级：DB 故障半边（作者用例只覆盖「项目不存在」）', () => {
  const boom = () => {
    vi.spyOn(prisma.project, 'findFirst').mockRejectedValue(
      new Error('[probe] 模拟 DB 故障：Project 表不可读'),
    );
  };

  it('DB 故障时段落照常注入（只写 id、不编造名字、不抛）', async () => {
    boom();
    const section = await projectContextSection(projectId);
    expect(section, '段落被整段丢弃 = 降级退化成「什么都不说」，缺陷复发').toContain(
      PROJECT_CONTEXT_HEADING,
    );
    expect(section).toContain(projectId);
    expect(section).toContain(NO_ASK_PROJECT_CLAUSE);
    // 不得编造名字：既不许出现夹具真名，也不许出现任何括注/占位名
    expect(section).not.toContain(FIXTURE_PROJECT_NAME);
    expect(section, '取不到名字就不写名字（诚实条款）').not.toMatch(
      /[（(].+[）)]/,
    );
    // 段落正文除标识本身外不得夹带占位名词
    expect(section).not.toMatch(/未命名|未知项目|某项目|N\/A/);
  });

  it('DB 故障时整个会话不炸，且 system 仍带当前项目（同知识段 D2 纪律）', async () => {
    boom();
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: 'match',
      },
      ctx: { tenantId, agentId: 'match', projectId, env: 'default' },
      prompt: '这个项目该推进什么？',
      script: [{ text: '好的。' }],
      telemetryWriter: async () => {}, // 不落库（DB 故障场景下遥测不是被测对象）
    });

    expect(run.finishReason, '取名失败不得打死会话').toBe('stop');
    expect(run.text).toContain('好的');
    expect(run.systemPerStep[0]).toContain(projectId);
    expect(run.systemPerStep[0]).toContain(NO_ASK_PROJECT_CLAUSE);
    expect(run.systemPerStep[0]).not.toContain(FIXTURE_PROJECT_NAME);
    expect(run.networkCalls).toEqual([]);
  });
});
