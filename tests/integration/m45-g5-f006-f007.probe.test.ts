// M4.5-AGENT-LOOP verify-G5（Evaluator 独立探针，非产品代码）——F006 / F007 补盲
//
// 【前置】Postgres 可达（本机 localhost:5434 / CI 的 postgres service）；`npx prisma generate` 已跑。
// 跨隔离上下文的坑写进文件本身（testing-env-patterns §7 纪律）：
//   - 本文件零外呼：F006 段用 ai/test 的 MockLanguageModelV4（testbed scriptedModel）+ fetch 哨兵；
//     绝不打真网关（本机 .env 里有真 key，跑真 loop 必须注入 mock model）。
//   - 除一处显式标注外，全部数据落 pid 唯一夹具租户并清理；dev 租户只读且**不假设它存在**。
//
// 【CI 环境约束（M3-A 教训，delivery-registry.test.ts:10 同款）】CI 的 unit job 只跑
// `prisma migrate deploy`、**不跑 seed** → 库里没有 slug='dev' 的租户。凡是走
// `buildToolContext()/getDevTenantId()` 的 route（本文件用到的 GET /api/actions 就是）在 CI 会
// 解析不到租户。故本文件的分层是：
//   · 装配层泄露面（`toPendingBatchItems`）→ 夹具租户，**任何环境无条件跑**；
//   · route 层「不论库什么状态都不得泄露内部字段」→ **无条件跑**（两个分支都断言）；
//   · route 层 200 + 逐项键集 → 仅当 dev 租户存在时跑，否则运行时 `skip()` 并打印原因
//     （不静默通过，也不留一个只在某台机器绿的用例）。
//
// 补的是既有测试的盲区，不是重复覆盖：
//  1) F006 现有断言在 route 这一层只做 **contract-surface grep**（读源码字符串），
//     没有一条断言证明 `data-persona_switch` 真的出现在 **HTTP 响应流**里。本文件驱动真 POST
//     handler，解析 SSE 正文，验事件与响应头语义（P9：头 = 起始人格）。
//  2) F007 现有集成测覆盖 3 件链，未覆盖「首项即失败」「execute 阶段失败」两条分支，
//     也未从 HTTP 层验 GET /api/actions 的**泄露面**（inputJson / hash / ticket 不得出现）。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LanguageModel } from 'ai';

// M5-AUTH-RLS F004：GET /api/actions 的租户改从登录会话解析（buildToolContext）。
// 本探针直调 route handler，进程里没有 Next 请求作用域 → 显式注入会话身份。
// 语义映射保持不变：**有 dev 种子 = 有会话（200）；无 dev 种子 = 无会话（失败关闭）**，
// 下方两条 route 层用例的 hasDevTenant 分支因此原样成立（且额外覆盖了未登录不吐细节）。
const sessionSeam = vi.hoisted(() => ({ tenantId: '', actor: 'g5-probe@test.local' }));
vi.mock('lib/auth/session-tenant', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/auth/session-tenant')
  >();
  const { makeSessionTenantMock } = await import('../support/session-mock');
  return makeSessionTenantMock(actual, sessionSeam);
});

// route.ts 用裸导入 'lib/agent/loop'（baseUrl=src）；mock 必须命中同一解析结果。
vi.mock('lib/agent/loop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lib/agent/loop')>();
  return {
    ...actual,
    runAgentLoop: (params: Parameters<typeof actual.runAgentLoop>[0]) =>
      actual.runAgentLoop({
        ...params,
        // 注入缝：mock 模型 + 夹具租户 ctx（真 loop / 真工具 / 真闸门，零外呼）
        model: injected.model,
        ctx: injected.ctx,
      }),
  };
});

import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { personaBoundary } from '../../src/lib/agent/registry';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { aggregatePending } from '../../src/lib/agent/orchestrator';
import { toPendingBatchItems } from '../../src/lib/gate/pending-items';
import {
  confirmAndExecuteSequentially,
  type BatchPost,
} from '../../src/lib/gate/batch-confirm';
import {
  installNoNetworkSentinel,
  scriptedModel,
} from '../support/agent-loop-testbed';
import { POST as agentPost } from '../../src/app/api/agent/route';
import { GET as actionsGet } from '../../src/app/api/actions/route';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m45-G5-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

/**
 * vi.mock 工厂在模块求值期跑，故用可变容器承载注入物（每个用例前设置）。
 * `model` 必须显式标 `LanguageModel | undefined`——标 `unknown` 会在 mock 工厂里
 * 撞 TS2322（Type 'unknown' is not assignable to type 'LanguageModel'），CI typecheck job 直接红。
 */
const injected: {
  model: LanguageModel | undefined;
  ctx: ToolContext | undefined;
} = {
  model: undefined,
  ctx: undefined,
};

/** CI 库无 seed → 无 slug='dev' 租户。用它决定 route 层 200 断言跑不跑（见文件头分层）。 */
let hasDevTenant = false;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 G5 验收夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `m45-g5-probe-${process.pid}` },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'orchestrator', projectId, env: 'default' };
  injected.ctx = ctx;
  // 不用 getDevTenantId()——它在缺租户时**抛错**；这里只是探测，不该炸。
  const devTenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  hasDevTenant = devTenant !== null;
  // 会话租户 = dev 租户（route 读的就是它）；无 dev 种子时留空串 = 未登录
  sessionSeam.tenantId = devTenant?.id ?? '';
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** 跑一次真 POST /api/agent，回响应 + 完整 SSE 正文。 */
async function postAgent(
  script: Parameters<typeof scriptedModel>[0],
  body: Record<string, unknown>,
): Promise<{ res: Response; text: string; network: string[] }> {
  injected.model = scriptedModel(script);
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await agentPost(
      new Request('http://127.0.0.1/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { res, text, network: sentinel.calls };
  } finally {
    sentinel.restore();
  }
}

/** 从 SSE 正文里挑出所有 data part（AI SDK UI stream 的 `data: {json}` 行）。 */
function ssePayloads(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => l.slice('data: '.length).trim())
    .filter((s) => s && s !== '[DONE]')
    .map((s) => JSON.parse(s) as Record<string, unknown>);
}

describe('F006 — persona_switch 事件真的出现在 HTTP 响应流里（补 contract-surface 盲区）', () => {
  it('接力会话：流内出 data-persona_switch（from/to/atStep + 与 registry 同源的 boundary），且 X-Agent-Id = 起始人格', async () => {
    const { res, text, network } = await postAgent(
      [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: projectId,
                summary: 'G5 探针：请洞察接手',
              },
            },
          ],
        },
        { text: '洞察已接手。' },
      ],
      {
        prompt: '这事交给洞察',
        context: {
          route: '/admin',
          projectId,
          env: 'default',
          agentId: 'orchestrator',
        },
      },
    );

    expect(res.status).toBe(200);
    expect(network, '零外呼').toEqual([]);

    const parts = ssePayloads(text);
    const switches = parts.filter((p) => p.type === 'data-persona_switch');
    expect(
      switches,
      `SSE 正文里没有 persona_switch 事件：\n${text.slice(0, 800)}`,
    ).toHaveLength(1);

    const data = switches[0].data as {
      from: string;
      to: string;
      atStep: number;
      boundary: { name: string; duty: string; isolation: string };
    };
    expect(data.from).toBe('orchestrator');
    expect(data.to).toBe('insight');
    expect(typeof data.atStep).toBe('number');
    // 边界卡文案与 registry 同源（不硬编码）
    const truth = personaBoundary('insight')!;
    expect(data.boundary.name).toBe(truth.name);
    expect(data.boundary.duty).toBe(truth.duty);
    expect(data.boundary.isolation).toBe(truth.isolation);

    // P9：响应头 = **起始人格**，不随切换改写
    expect(res.headers.get('X-Agent-Id')).toBe('orchestrator');
  });

  it('无接力会话：零 persona_switch 事件（不发空事件污染流），行为与切换前一致', async () => {
    const { res, text, network } = await postAgent([{ text: '好的。' }], {
      prompt: '就问一句',
      context: {
        route: '/admin',
        projectId,
        env: 'default',
        agentId: 'orchestrator',
      },
    });
    expect(res.status).toBe(200);
    expect(network).toEqual([]);
    expect(text).not.toContain('persona_switch');
    expect(res.headers.get('X-Agent-Id')).toBe('orchestrator');
  });
});

/** 卡片数据形状的白名单（= `PendingBatchItem` 的全部字段）。 */
const ITEM_KEYS = [
  'agentId',
  'createdAt',
  'harm',
  'id',
  'projectId',
  'toolName',
].sort();

/** 绝不可出现在披露面里的内部字段名。 */
const FORBIDDEN = [
  'inputJson',
  'payloadHash',
  'ticket',
  'ticketHash',
  'token',
  'harmJson',
];

describe('F007 — 待确认清单的泄露面', () => {
  it('[任何环境] 装配层：卡片数据只含披露字段，内部字段一个不带（夹具租户，不依赖 dev 种子）', async () => {
    const r = await executeTool(
      'create_share_link',
      { scope: 'quarterly' },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    const items = toPendingBatchItems(await aggregatePending(ctx));
    expect(items.length).toBeGreaterThan(0);
    const raw = JSON.stringify(items);
    for (const forbidden of FORBIDDEN) {
      expect(raw, `装配产物泄露了 ${forbidden}`).not.toContain(forbidden);
    }
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    }
    // 清掉本用例造的这件，避免影响后面「恰好 7 件」的计数
    await prisma.pendingAction.deleteMany({ where: { tenantId } });
    await prisma.operationLog.deleteMany({ where: { tenantId } });
  });

  it('[任何环境] route 层：无论库里有没有 dev 租户，响应体都不得带内部字段', async () => {
    const res = await actionsGet(new Request('http://127.0.0.1/api/actions'));
    // CI（无 seed）解析不到 dev 租户 → 必须**失败关闭**且不吐内部细节；本机有 dev 租户 → 200。
    expect(hasDevTenant ? res.status === 200 : res.status >= 400).toBe(true);
    const raw = await res.text();
    for (const forbidden of FORBIDDEN) {
      expect(raw, `响应泄露了 ${forbidden}`).not.toContain(forbidden);
    }
    expect(raw, '错误响应不得回吐堆栈').not.toMatch(
      /at\s+\w+\s+\(.*:\d+:\d+\)/,
    );
  });

  it('[需 dev 租户] route 层 200 + 逐项键集 = PendingBatchItem 白名单', async (t) => {
    if (!hasDevTenant) {
      // 不静默通过：明确跳过并说明原因（CI unit job 只 migrate 不 seed）
      t.skip(
        '库中无 slug=dev 租户（CI unit job 不跑 seed）——本条只在有 dev 种子的环境有意义',
      );
      return;
    }
    const res = await actionsGet(new Request('http://127.0.0.1/api/actions'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    }
  });
});

describe('F007 — 聚合面「列全不截断」与部分失败分支补盲', () => {
  it('7 件 pending 全部进聚合数据（无 take / 无截断），harm 对象名单逐条完整', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await executeTool(
        'create_share_link',
        { scope: 'quarterly' },
        ctx,
      );
      expect(isPendingEnvelope(r.output)).toBe(true);
      ids.push((r.output as { pendingActionId: string }).pendingActionId);
    }
    const items = toPendingBatchItems(await aggregatePending(ctx));
    expect(items).toHaveLength(7);
    expect(items.every((i) => ids.includes(i.id))).toBe(true);
    for (const it of items) {
      expect(it.harm!.targets.length).toBeGreaterThan(0);
      // 名单不得被摘要成「等 N 人 / ...」
      for (const t of it.harm!.targets) {
        expect(t).not.toMatch(/等\s*\d+\s*(人|位|个)|\.{3}|…/);
      }
    }
    // 组件侧不得对条目做截断（源码级：无 slice / 无 line-clamp / 无 truncate）
    // 【坑】只看代码行——注释里把 truncate 当反面教材点名是允许的（同 F007 自己踩过的
    // 「git grep 把注释抓成命中」一族）。
    const { readFileSync } = await import('node:fs');
    const card = readFileSync(
      'src/components/common/PendingBatchCard.tsx',
      'utf8',
    )
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
      .join('\n');
    expect(card).not.toMatch(/items\.slice\(/);
    expect(card).not.toMatch(/line-clamp|truncate/);
  });

  it('首项即失败：后续项照常执行（不中断），错误原文与 code 逐项保留', async () => {
    const mk = async (): Promise<string> => {
      const r = await executeTool(
        'create_share_link',
        { scope: 'quarterly' },
        ctx,
      );
      return (r.output as { pendingActionId: string }).pendingActionId;
    };
    const bad = await mk();
    const good = await mk();
    await prisma.pendingAction.update({
      where: { id: bad },
      data: { status: 'rejected' },
    });

    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    const post: BatchPost = async (url, body) => {
      const m = url.match(/^\/api\/actions\/([^/]+)\/(confirm|execute)$/)!;
      const { confirmPendingAction, executePendingAction } = await import(
        '../../src/lib/agent/gate/gate'
      );
      try {
        const r =
          m[2] === 'confirm'
            ? await confirmPendingAction(m[1], ctx)
            : await executePendingAction(
                m[1],
                typeof body?.ticket === 'string' ? body.ticket : '',
                ctx,
              );
        return {
          ok: true,
          status: 200,
          body: r as unknown as Record<string, unknown>,
        };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return {
          ok: false,
          status: 400,
          body: { error: err.message ?? '失败', code: err.code ?? null },
        };
      }
    };

    const result = await confirmAndExecuteSequentially([bad, good], post);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: bad,
      ok: false,
      stage: 'confirm',
    });
    expect(result.items[0].code).toBe('GATE_ALREADY_DECIDED');
    expect(result.items[0].error).toBeTruthy();
    expect(result.items[1]).toMatchObject({
      id: good,
      ok: true,
      stage: 'done',
    });
    // 恰好一次副作用（失败项零副作用）
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareBefore + 1,
    );
  });

  it('execute 阶段失败：stage=execute + 服务端原文不被归一，且不吞掉后续项', async () => {
    const failingPost: BatchPost = async (url) => {
      if (url.endsWith('/confirm'))
        return { ok: true, status: 200, body: { ticket: 'tk-fake' } };
      if (url.includes('boom'))
        return {
          ok: false,
          status: 409,
          body: { error: '执行票已过期（GATE_EXPIRED）', code: 'GATE_EXPIRED' },
        };
      return { ok: true, status: 200, body: { ok: true } };
    };
    const r = await confirmAndExecuteSequentially(
      ['boom', 'ok-1'],
      failingPost,
    );
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.items[0]).toMatchObject({
      id: 'boom',
      stage: 'execute',
      code: 'GATE_EXPIRED',
    });
    expect(r.items[0].error).toBe('执行票已过期（GATE_EXPIRED）');
    expect(r.items[1].ok).toBe(true);
  });

  it('confirm 未回票据：不进入 execute（不拿空票去消费副作用）', async () => {
    const seen: string[] = [];
    const post: BatchPost = async (url) => {
      seen.push(url);
      return {
        ok: true,
        status: 200,
        body: {
          /* 无 ticket */
        },
      };
    };
    const r = await confirmAndExecuteSequentially(['x1'], post);
    expect(r.failed).toBe(1);
    expect(r.items[0].stage).toBe('confirm');
    expect(seen).toEqual(['/api/actions/x1/confirm']);
  });
});
