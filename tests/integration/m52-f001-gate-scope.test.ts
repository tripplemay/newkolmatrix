// M5.2-TENANT-COVERAGE F001（spec D-3 裁决＝处置③）— execute 路径「作用域下沉」的判据。
//
// 【本文件守的是什么】`executePendingAction` 是三段**独立事务**（①认领 → ②副作用+收尾 →
// ③失败收尾）。M5.2 要给全站入口包租户作用域，而这一条如果也在入口层包，三段会合并成
// 一个事务，② 一回滚就把 ① 的票据消费和 ③ 的 failed 态一起带走。
// 于是本批把作用域**下沉**进 gate.ts，逐段各开一个事务。本文件钉住这个选择。
//
// 【三条用例的分工，别当成三条重复断言】
//   §1 主断言（行为级）：副作用失败后，failed 态与 ticketUsedAt **真在库里**、irrev 零残留。
//   §2 机械守门：谁哪天把 execute route 改回「入口层包」，从作用域内调本函数会当场抛
//      NestedTransactionOptionsError —— 这是既有 fail-closed 机件，本用例把它钉成常驻断言。
//   §3 **阳性对照**：把三段合并成一个事务的结构原样跑一遍，证明 §1 的断言**会红**。
//      没有 §3，§1 对「三段合并」同样成立（两种结构下 rejects 都发生），零鉴别力 ——
//      这正是 M5.1b F004 首轮踩过的坑（「写之前就被拒」的零残留对病灶零鉴别力）。
//
// 【为什么 §3 不能直接拿真 gate 跑一遍合并形态】从外层作用域调真 gate 会先被 §2 那道
// fail-closed 拦住（② 段带选项 → 嵌套即抛），根本走不到失败收尾。故 §3 用**结构镜像**：
// 同样的三段、同样的真表真事务，唯一变量是「段内自开事务」还是「靠外层大事务兜着」。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/** §4 用：直调 route handler 时没有 Next 请求作用域，会话身份从这里给。 */
const sessionSeam = vi.hoisted(() => ({ tenantId: '', actor: 'm52f001@test.local' }));
vi.mock('lib/auth/session-tenant', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/auth/session-tenant')>();
  const { makeSessionTenantMock } = await import('../support/session-mock');
  return makeSessionTenantMock(actual, sessionSeam);
});

import { POST as confirmRoute } from '../../src/app/api/actions/[id]/confirm/route';
import { POST as executeRoute } from '../../src/app/api/actions/[id]/execute/route';
import { executePendingAction, confirmPendingAction } from '../../src/lib/agent/gate/gate';
import { executeTool } from '../../src/lib/agent/execute';
import { HARM_LABEL, isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { registerTool } from '../../src/lib/agent/tools/registry';
import { privilegedDb } from '../../src/lib/db/privileged';
import { prisma } from '../../src/lib/db/prisma';
import {
  NestedTransactionOptionsError,
  withTenant,
} from '../../src/lib/db/tenant-scope';
import type { ToolContext } from '../../src/lib/agent/tools/types';

if (!process.env.DATABASE_URL) {
  throw new Error('[M5.2-F001] 缺 DATABASE_URL —— 本文件断言真事务行为，必须有真库');
}

const TAG = `m52f001-${process.pid}`;
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
const BOOM = 'M5.2-F001 探针刻意抛错（先经 ctx.db 真写一行，再抛）';
const BIZ_MARKER = `${TAG}-业务写入`;
const FAILING_TOOL = `m52_f001_failing_${process.pid}`;

let tenantId = '';
let ctx: ToolContext;

registerTool({
  name: FAILING_TOOL,
  description: '[test-only] 经 ctx.db 写一行后抛错，用于验失败收尾的持久性。',
  class: 'outbound',
  source: 'native',
  inputSchema: z.object({}),
  buildHarm: () => ({
    action: FAILING_TOOL,
    summary: 'M5.2 F001 失败收尾探针',
    targets: ['探针目标'],
    quantity: 1,
    irreversible: true,
    evidence: '探针：无任何外部副作用，只写一行 OperationLog 后抛错。',
    expiresAt: new Date().toISOString(),
    label: HARM_LABEL,
  }),
  execute: async (_input: unknown, c: ToolContext) => {
    const db = c.db ?? prisma;
    await db.operationLog.create({
      data: {
        tenantId: c.tenantId,
        kind: 'auto',
        actor: c.agentId ?? 'probe',
        summary: BIZ_MARKER,
        ref: c.gateActionId ?? null,
      },
    });
    throw new Error(BOOM);
  },
});

beforeAll(async () => {
  delete process.env.DB_APP_ROLE_RUNTIME; // 全程开关关：本文件断言的是事务结构，与 RLS 无关
  const tenant = await privilegedDb.tenant.create({
    data: { name: `${TAG}-tenant`, slug: `${TAG}-tenant` },
    select: { id: true },
  });
  tenantId = tenant.id;
  ctx = { tenantId, agentId: 'reach', projectId: null, env: 'default' };
  sessionSeam.tenantId = tenantId; // §4 的 route 调用以本租户的会话发出
});

afterAll(async () => {
  for (const step of [
    () => privilegedDb.operationLog.deleteMany({ where: { tenantId } }),
    () => privilegedDb.pendingAction.deleteMany({ where: { tenantId } }),
    () => privilegedDb.tenant.deleteMany({ where: { id: tenantId } }),
  ]) {
    try {
      await step();
    } catch (err) {
      console.warn('[M5.2-F001] 清理步骤失败（继续）:', err);
    }
  }
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
});

/** 走完整两步票据，返回停在 confirmed 的 PendingAction id + 票。 */
async function armTicket(): Promise<{ paId: string; ticket: string }> {
  const r = await executeTool(FAILING_TOOL, {}, ctx);
  if (!isPendingEnvelope(r.output)) {
    throw new Error('outbound 动作应停在闸门（pending）');
  }
  const paId = r.output.pendingActionId;
  const conf = await confirmPendingAction(paId, ctx);
  return { paId, ticket: conf.ticket };
}

const readPa = (paId: string) =>
  privilegedDb.pendingAction.findUnique({
    where: { id: paId },
    select: { status: true, ticketUsedAt: true },
  });

/* ================================================================== *
 * §1 主断言 —— 失败收尾活过副作用回滚
 * ================================================================== */

describe('§1 副作用失败后，failed 态与票据消费真在库里', () => {
  it('🔒 status=failed + ticketUsedAt 已落库；irrev 零行；业务写入随 ② 段回滚', async () => {
    const { paId, ticket } = await armTicket();

    await expect(executePendingAction(paId, ticket, ctx)).rejects.toThrowError(
      new RegExp(BOOM),
    );

    const pa = await readPa(paId);
    // ③ 段必须活过 ② 段的回滚 —— 这两条正是「入口层包」会丢掉的东西
    expect(pa?.status, 'failed 态被回滚带走了 —— ③ 段落进了别人的事务').toBe('failed');
    expect(
      pa?.ticketUsedAt,
      'ticketUsedAt 被回滚带走了 —— 一次性执行票变回可重放',
    ).not.toBeNull();

    // ② 段的语义没变：工具未成功 ⇒ 不留 irrev；业务写入随事务回滚
    expect(
      await privilegedDb.operationLog.count({
        where: { tenantId, kind: 'irrev', ref: paId },
      }),
    ).toBe(0);
    expect(
      await privilegedDb.operationLog.count({
        where: { tenantId, summary: BIZ_MARKER },
      }),
      '工具的业务写入没有随 ② 段事务回滚',
    ).toBe(0);

    // 失败留痕确实写下了（不是「什么都没发生」）
    expect(
      await privilegedDb.operationLog.count({
        where: { tenantId, kind: 'auto', ref: paId },
      }),
    ).toBe(1);
  });

  it('🔒 票据真被消费：拿同一张票再执行 → 409 已终态（不是又跑一次）', async () => {
    const { paId, ticket } = await armTicket();
    await expect(executePendingAction(paId, ticket, ctx)).rejects.toThrowError(
      new RegExp(BOOM),
    );
    // 若 ① 段的认领被回滚，这里会重新走一遍副作用（再抛 BOOM），而不是被状态机挡住
    await expect(
      executePendingAction(paId, ticket, ctx),
    ).rejects.toThrowError(/已处理/);
  });
});

/* ================================================================== *
 * §2 机械守门 —— 谁把它改回「入口层包」，当场 fail-closed
 * ================================================================== */

describe('§2 executePendingAction 不得在租户作用域内被调用', () => {
  it('🔒 从作用域内调 → NestedTransactionOptionsError（② 段带选项，嵌套无处可施）', async () => {
    const { paId, ticket } = await armTicket();
    await expect(
      withTenant(tenantId, () => executePendingAction(paId, ticket, ctx)),
    ).rejects.toBeInstanceOf(NestedTransactionOptionsError);
  });
});

/* ================================================================== *
 * §3 阳性对照 —— 三段合并成一个事务，§1 的断言必须红
 * ================================================================== */

describe('§3 阳性对照：三段合并（= 入口层包的形态）会丢掉 §1 断言的两样东西', () => {
  /**
   * gate.ts executePendingAction 的三段结构镜像。
   * `ownScope=true`  = 段内各自 withTenant（as-built 的处置③）
   * `ownScope=false` = 段内直接用 prisma 代理，靠外层大事务兜着（处置②的形态）
   */
  async function gateShaped(paId: string, ownScope: boolean): Promise<void> {
    const scoped = <T>(fn: () => Promise<T>): Promise<T> =>
      ownScope ? withTenant(tenantId, fn) : fn();

    await scoped(() =>
      prisma.pendingAction.updateMany({
        where: { id: paId, status: 'confirmed', ticketUsedAt: null },
        data: { status: 'executing', ticketUsedAt: new Date() },
      }),
    );
    try {
      await withTenant(tenantId, async (tx) => {
        await tx.operationLog.create({
          data: { tenantId, kind: 'irrev', actor: 'probe', summary: `${TAG}-irrev` },
        });
        throw new Error(BOOM);
      });
    } catch (err) {
      await scoped(async () => {
        await prisma.pendingAction.update({
          where: { id: paId },
          data: { status: 'failed' },
        });
        await prisma.operationLog.create({
          data: { tenantId, kind: 'auto', actor: 'probe', summary: `${TAG}-failed痕` },
        });
      });
      throw err;
    }
  }

  const failedTraces = () =>
    privilegedDb.operationLog.count({
      where: { tenantId, summary: `${TAG}-failed痕` },
    });

  it('镜像忠实性自证：段内自开事务时，两样都留得住（= §1 的结果）', async () => {
    const { paId } = await armTicket();
    const before = await failedTraces();
    await expect(gateShaped(paId, true)).rejects.toThrowError(new RegExp(BOOM));

    const pa = await readPa(paId);
    expect(pa?.status).toBe('failed');
    expect(pa?.ticketUsedAt).not.toBeNull();
    expect(await failedTraces()).toBe(before + 1);
  });

  it('🔒 靠外层大事务兜着 → status 退回 confirmed、ticketUsedAt 变回 null、failed 痕 0', async () => {
    const { paId } = await armTicket();
    const before = await failedTraces();

    await expect(
      withTenant(tenantId, () => gateShaped(paId, false)),
    ).rejects.toThrowError(new RegExp(BOOM));

    const pa = await readPa(paId);
    // 这三条就是「入口层包」的实际代价 —— §1 的断言在这个形态下逐条会红
    expect(pa?.status).toBe('confirmed');
    expect(pa?.ticketUsedAt).toBeNull();
    expect(await failedTraces()).toBe(before);
  });
});

/* ================================================================== *
 * §4 route 层的守门 —— 谁把 execute route 改成入口层包，这一组当场红
 *
 * §2 守的是「服务被人从作用域里调」，但它证不了 **route 文件本身**没被改。
 * 本组直调真 route handler 走完整 confirm → execute：
 *   · as-built（execute 不在入口层包）→ 失败收尾照常落库，status=failed
 *   · 若给 execute route 套上 withSessionTenant → ② 段带选项变嵌套 → 当场
 *     NestedTransactionOptionsError，① 段的认领随入口事务回滚 → status 退回 confirmed
 * 于是下面那条 `toBe('failed')` 就是这个设计决定的机械判据。
 * ================================================================== */

describe('§4 route 层：confirm 走入口层包裹，execute 走领域层作用域', () => {
  const req = (body?: unknown) =>
    new Request('http://localhost/api/actions/x', {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  it('🔒 confirm route（入口层包）签票 200 → execute route 失败后 status=failed 仍落库', async () => {
    const r = await executeTool(FAILING_TOOL, {}, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    const params = Promise.resolve({ id: paId });

    // 入口层包裹的 confirm：正常签票
    const confirmRes = await confirmRoute(req(), { params });
    expect(confirmRes.status).toBe(200);
    const { ticket } = (await confirmRes.json()) as { ticket: string };
    expect(typeof ticket).toBe('string');

    // execute：工具必抛 → 非闸门分码错 → 5xx，但失败收尾必须已落库
    const execRes = await executeRoute(req({ ticket }), {
      params: Promise.resolve({ id: paId }),
    });
    expect(execRes.ok).toBe(false);

    const pa = await readPa(paId);
    expect(
      pa?.status,
      'execute route 被改成入口层包了 —— 失败收尾随入口事务一起回滚',
    ).toBe('failed');
    expect(pa?.ticketUsedAt).not.toBeNull();
  });
});

/* ================================================================== *
 * §5 confirm 的惰性过期翻转 —— D-3 裁决的**第二处**（同 execute 一个族）
 *
 * confirmPendingAction 在确认窗过期时先把 pending 惰性翻成 expired，紧接着抛 GATE_EXPIRED。
 * 这同样是「先写后抛」：入口层一包，翻转随抛错回滚。
 * 三条用例同 §1/§3 的分工：主断言 + 阳性对照 + route 层守门。
 * ================================================================== */

describe('§5 确认窗过期的惰性翻转必须活过 GATE_EXPIRED', () => {
  /** 造一条确认窗已过的 pending 动作。 */
  const makeExpired = async (label: string) =>
    (
      await privilegedDb.pendingAction.create({
        data: {
          tenantId,
          kind: 'gate',
          toolName: 'probe_tool',
          payloadHash: `${TAG}-${label}`,
          harmJson: { action: 'probe' },
          status: 'pending',
          expiresAt: new Date(Date.now() - 1000),
        },
        select: { id: true },
      })
    ).id;

  const statusOf = async (id: string) => (await readPa(id))?.status;

  it('🔒 裸调（as-built）→ 抛 GATE_EXPIRED，且 status 真被翻成 expired', async () => {
    const id = await makeExpired('s5-bare');
    await expect(confirmPendingAction(id, ctx)).rejects.toThrowError(/过期/);
    expect(
      await statusOf(id),
      '惰性翻转被回滚带走了 —— confirm 落进了别人的事务',
    ).toBe('expired');
  });

  it('🔒 阳性对照：外层有作用域（= 入口层包）→ 翻转被回滚，status 退回 pending', async () => {
    const id = await makeExpired('s5-wrapped');
    await expect(
      withTenant(tenantId, () => confirmPendingAction(id, ctx)),
    ).rejects.toThrowError(/过期/);
    // 没有这一条，上一条对「入口层包」同样成立（两种形态都抛 GATE_EXPIRED），零鉴别力
    expect(await statusOf(id)).toBe('pending');
  });

  it('🔒 route 层：confirm route 走领域层作用域 → 翻转落库', async () => {
    const id = await makeExpired('s5-route');
    const res = await confirmRoute(
      new Request('http://localhost/api/actions/x', { method: 'POST' }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(410); // GATE_EXPIRED
    expect(
      await statusOf(id),
      'confirm route 被改成入口层包了 —— 惰性翻转随入口事务一起回滚',
    ).toBe('expired');
  });
});
