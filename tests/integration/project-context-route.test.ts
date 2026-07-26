// M4.6-CTX F001 fixing round1 — 真 route 路径核实（D1）
//
// 【为什么单独一个文件】本文件用 vi.mock 在模块层替换 chatModel / buildToolContext，
// 会影响整个文件的模块初始化；与 project-context-injection.test.ts 的服务层用例分开放，
// 免得 mock 语义外溢到那些不需要它的用例。
//
// 【补的是什么洞】首轮验收 D1：acceptance 明写「集成测经真 route 路径核实注入生效」，
// 但交付的 9 条用例**全部直接驱动 runAgentLoop**（服务层），无一经过
// `src/app/api/agent/route.ts` 的 POST —— 而把客户端 `body.context.projectId` 变成
// `copilot.projectId` 的正是 route 里的 `resolveContext`（未导出、零用例）。
// 判据：framework/patterns/testing-env-patterns.md §8「服务层测试 ≠ HTTP 链测试」，
// 以及仓内同族先例 m45-evaluator-loop-probe.test.ts（M4.5 F001 同样的问题）。
//
// 断言对象是**模型那一步实际收到的 system 正文**（读 mock provider 的 doStreamCalls），
// 不是我们以为拼进去的东西。零外呼（fetch 哨兵）、零真实副作用、夹具按 pid 隔离。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';
import {
  NO_ASK_PROJECT_CLAUSE,
  PROJECT_CONTEXT_HEADING,
} from '../../src/lib/agent/project-context';

/** vi.mock 工厂被提升到文件顶部 → 支点必须走 vi.hoisted。 */
const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as unknown[],
  models: [] as Array<{ doStreamCalls: unknown[] }>,
}));

// route → runAgentLoop 不带 model / ctx（那正是真实请求路径），故从模块层替换。
// 被测对象仍是产品的 route + loop 装配本体。
vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return {
    ...actual,
    chatModel: () => {
      const m = scriptedModel(seam.script as ScriptedStep[], {
        text: '（脚本用尽）',
      });
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

const FIXTURE_SLUG = `test-tenant-m46-route-${process.pid}`;
const PROJECT_NAME = `m46-route-项目-${process.pid}`;

let tenantId: string;
let projectId: string;

/** 取一次 provider 调用实际收到的 system 正文。 */
function systemOf(call: unknown): string {
  const prompt = (call as { prompt: LanguageModelV4CallOptions['prompt'] })
    .prompt;
  const first = prompt.find((m) => m.role === 'system');
  if (!first) return '';
  const content = (first as { content: unknown }).content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

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
    return {
      status: res.status,
      agentIdHeader: res.headers.get('X-Agent-Id'),
      text,
      systems: (seam.models[0]?.doStreamCalls ?? []).map(systemOf),
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: `M4.6 route 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: PROJECT_NAME },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: 'orchestrator',
    projectId,
    env: 'default',
  } satisfies ToolContext;
});

afterAll(async () => {
  // 【软引用无 FK】OperationLog / Handoff 对 Tenant 只有 @@index，删租户**不级联**——
  // 漏清即留孤儿行（首轮验收 D3 实测：每跑泄 2 log + 1 handoff）。故逐表按 tenantId 清，
  // 并断言残留为 0（只断言 tenant 残留 = 假信心）。
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, handoffs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.handoff.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: FIXTURE_SLUG } }),
  ]);
  expect(
    { logs, handoffs, pas, projects, tenants },
    '夹具残留（含软引用表）',
  ).toEqual({ logs: 0, handoffs: 0, pas: 0, projects: 0, tenants: 0 });
});

describe('真 route POST /api/agent —— 项目上下文注入（D1）', () => {
  it('项目页请求：模型第一步实际收到的 system 含 projectId + 项目名 + 不要索要条款', async () => {
    const r = await postAgent(
      {
        prompt: '这个项目该推进什么？',
        context: {
          route: `/admin/campaigns/${projectId}`,
          projectId,
          env: 'default',
          agentId: 'match',
        },
      },
      [{ text: '好的。' }],
    );
    expect(r.status).toBe(200);
    expect(r.networkCalls, '零外呼').toEqual([]);
    expect(r.agentIdHeader).toBe('match');
    expect(r.systems.length).toBeGreaterThan(0);
    expect(
      r.systems[0],
      '经真 route（resolveContext）后，模型仍必须看得见当前项目',
    ).toContain(projectId);
    expect(r.systems[0]).toContain(PROJECT_CONTEXT_HEADING);
    expect(r.systems[0]).toContain(PROJECT_NAME);
    expect(r.systems[0]).toContain(NO_ASK_PROJECT_CLAUSE);
  });

  it('工作区层请求（body 不带 projectId）：真 route 也不注水', async () => {
    seam.ctx = {
      tenantId,
      agentId: 'orchestrator',
      projectId: null,
      env: 'default',
    } satisfies ToolContext;
    try {
      const r = await postAgent(
        { prompt: '今天有什么要办的？', context: { route: '/admin' } },
        [{ text: '好的。' }],
      );
      expect(r.status).toBe(200);
      expect(r.systems[0]).not.toContain(PROJECT_CONTEXT_HEADING);
      expect(r.systems[0]).not.toContain(NO_ASK_PROJECT_CLAUSE);
      // 人格段本体仍在（证明不是整个 system 空了导致的假通过）
      expect(r.systems[0].length).toBeGreaterThan(50);
    } finally {
      seam.ctx = {
        tenantId,
        agentId: 'orchestrator',
        projectId,
        env: 'default',
      } satisfies ToolContext;
    }
  });

  it('真 route 上发生接力：接手后那一步的 system 仍带当前项目', async () => {
    const r = await postAgent(
      {
        prompt: '让洞察接手算 ROI',
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
                artifactRef: 'route-fixture',
                summary: '请洞察接手做 ROI 复盘',
              },
            },
          ],
        },
        { text: '已交接。' },
      ],
    );
    expect(r.status).toBe(200);
    expect(r.networkCalls, '零外呼').toEqual([]);
    expect(
      r.systems.length,
      '接力后应还有一步（否则下面断言取不到目标）',
    ).toBeGreaterThan(1);
    expect(r.systems[1], '接手后的 system 缺当前项目').toContain(projectId);
    expect(r.systems[1]).toContain(NO_ASK_PROJECT_CLAUSE);
    expect(r.systems[1], '第二步 system 应已换人格').not.toBe(r.systems[0]);
  });
});
