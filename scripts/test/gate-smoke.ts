// AGENT-FOUNDATION F009 → M3-A-REACH-CRM F002 — AI→人闸门 smoke + 变异测试（D20 硬性）
//
// G1 服务端强制 / G2 harm 如实披露 / G3 internal 不加闸门 / G4 无阈值
// G5 两步票据：confirm 签票（票仅响应出现一次，DB 只存 hash）→ execute 消费票 → 同事务 executed+irrev
// G6 分码负例：未确认先执行 403 / 伪票 403 / 票过期 410 / pending 过期 410 / reject 真实 rejected 态
// G7 7 态断言：枚举 7 值 + failed（副作用失败无 irrev 行）+ executing 认账
// G8 并发竞态（消 R15）：双确认恰一胜 / 双消费恰一胜（副作用恰好一次）
// + ★D20 变异测试：把拦截退回原状（直调 tool.execute 绕过 executeTool 门控）→「无副作用」断言必须变红。
//
// 运行：npm run gate:smoke   退出码：0=全绿 / 1=任一失败。

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PendingActionStatus } from '@prisma/client';
import { executeTool } from '../../src/lib/agent/execute';
import {
  GateError,
  confirmPendingAction,
  executePendingAction,
  getPendingActionDetail,
  rejectPendingAction,
} from '../../src/lib/agent/gate/gate';
import { HARM_LABEL, isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getTool, registerTool } from '../../src/lib/agent/tools/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { SENT_MARKER } from '../../src/lib/agent/tools/send-outreach';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import type { ToolContext } from '../../src/lib/agent/tools/types';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function countSent(tenantId: string): Promise<number> {
  return prisma.operationLog.count({
    where: { tenantId, summary: { contains: SENT_MARKER } },
  });
}

/** 期望抛出指定分码的 GateError；返回是否命中。 */
async function expectGateError(
  fn: () => Promise<unknown>,
  code: GateError['code'],
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return err instanceof GateError && err.code === code;
  }
}

/** F003 夹具：合成 KOL（带 contactEmail 测试地址，非真实 KOL）+ 项目。 */
const FIXTURE = {
  kolHandle: `gate-smoke-kol-${process.pid}`,
  email: 'gate-smoke@test.invalid', // 默认 mock 不外呼；即便误配真 key 也是不可达域
  projectName: `gate-smoke-project-${process.pid}`,
};

/** 新建一个 send_outreach pending 动作（F003 单人语法），返回其 PendingAction id。 */
async function newPending(
  ctx: ToolContext,
  ids: { projectId: string; kolId: string },
  subject: string,
): Promise<string> {
  const r = await executeTool(
    'send_outreach',
    {
      projectId: ids.projectId,
      kolId: ids.kolId,
      subject,
      body: `${subject}——正文`,
    },
    ctx,
  );
  if (!isPendingEnvelope(r.output)) throw new Error('预期 pending 信封');
  return r.output.pendingActionId;
}

const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

async function main(): Promise<void> {
  console.log('[gate-smoke] AI→人闸门验证开始（两步票据 + 7 态）');
  getNativeToolNames();
  // G7 用：副作用必抛错的 outbound 工具（制造 failed 态；仅注册在本进程内）
  registerTool({
    name: 'gate_smoke_failing_tool',
    description: '[test-only] 副作用必失败的 outbound 工具',
    class: 'outbound',
    source: 'native',
    inputSchema: z.object({ note: z.string() }),
    buildHarm: (input: { note: string }) => ({
      action: 'gate_smoke_failing_tool',
      summary: '测试专用：执行必失败',
      targets: ['@nobody'],
      irreversible: true,
      evidence: input.note,
      expiresAt: new Date().toISOString(),
      label: HARM_LABEL,
    }),
    execute: async () => {
      throw new Error('测试注入的副作用失败');
    },
  });

  // G4 用：带 50 位对象 harm 的 outbound 工具（证无阈值分级——大批量与单人走同一确认流程）
  registerTool({
    name: 'gate_smoke_bulk_tool',
    description: '[test-only] 大批量 harm 的 outbound 工具（D28 无阈值断言用）',
    class: 'outbound',
    source: 'native',
    inputSchema: z.object({ note: z.string() }),
    buildHarm: (input: { note: string }) => ({
      action: 'gate_smoke_bulk_tool',
      summary: '测试专用：50 位对象批量动作',
      targets: Array.from({ length: 50 }, (_, i) => `@kol${i}`),
      quantity: 50,
      irreversible: true,
      evidence: input.note,
      expiresAt: new Date().toISOString(),
      label: HARM_LABEL,
    }),
    execute: async () => ({ ok: true }),
  });

  const ctx = await buildToolContext({ agentId: 'reach' });
  const createdPA: string[] = [];

  // ── F003 夹具：合成 KOL（contactEmail=测试地址）+ 项目（结束后清理；不触碰真实 KOL 行，P1）──
  const fxKol = await prisma.kol.create({
    data: {
      tenantId: ctx.tenantId,
      canonicalHandle: FIXTURE.kolHandle,
      displayName: 'Gate Smoke 测试创作者',
      handle: FIXTURE.kolHandle,
      contactEmail: FIXTURE.email,
      fieldProvenance: {
        contactEmail: { source: 'user_input', fetchedAt: new Date().toISOString() },
      },
    },
    select: { id: true },
  });
  const fxProject = await prisma.project.create({
    data: { tenantId: ctx.tenantId, name: FIXTURE.projectName },
    select: { id: true },
  });
  const fx = { projectId: fxProject.id, kolId: fxKol.id };

  try {
    // ── G1：outbound 服务端强制（无令牌 → pending，副作用未执行）──
    const before = await countSent(ctx.tenantId);
    const r1 = await executeTool(
      'send_outreach',
      {
        projectId: fx.projectId,
        kolId: fx.kolId,
        subject: '诚邀参与《星轨协议》上线创作',
        body: '你好，我们正在为《星轨协议》上线寻找创作者合作……',
      },
      ctx,
    );
    assert(
      isPendingEnvelope(r1.output),
      'G1: outbound send_outreach 无令牌 → 返回 pending 信封（未执行）',
    );
    const env = r1.output as {
      pendingActionId: string;
      harm: Record<string, unknown>;
    };
    createdPA.push(env.pendingActionId);
    assert(
      (await countSent(ctx.tenantId)) === before,
      'G1: 副作用未执行（无 SENT 留痕新增）',
    );
    // 模型永远拿不到令牌/票：pending 信封里无任何 token/ticket 字段
    assert(
      !('confirmationToken' in (r1.output as object)) &&
        !('token' in (r1.output as object)) &&
        !('ticket' in (r1.output as object)),
      'G1: pending 信封不含任何令牌/执行票（模型无法自我放行）',
    );

    // ── G2：harm 如实披露（单一 zod schema；F003 起收件地址从 DB 读真值，不信任模型转述）──
    const harm = env.harm as {
      action: string;
      targets: string[];
      irreversible: boolean;
      label: string;
    };
    assert(harm.action === 'send_outreach', 'G2: harm.action=send_outreach');
    assert(
      Array.isArray(harm.targets) &&
        harm.targets.length === 1 &&
        harm.targets[0].includes(FIXTURE.email),
      'G2: harm.targets 如实披露库内真实收件地址（DB 读值，非模型转述）',
    );
    assert(harm.irreversible === true, 'G2: harm.irreversible=true');
    assert(harm.label === '对外·不可撤销', 'G2: 统一红标「对外·不可撤销」');

    // ── G3：internal 动作不加闸门 ──
    const s = await executeTool(
      'search_kols',
      { query: '坦克世界', topK: 3 },
      ctx,
    );
    assert(
      !isPendingEnvelope(s.output),
      'G3: internal search_kols 不弹确认框（直接执行，非 pending）',
    );

    // ── G4：无阈值分级（50 位对象的 harm 与单人走完全相同确认流程；send_outreach 本批
    //    为单人语法（P7），批量维度由测试工具承载断言）──
    const rBig = await executeTool(
      'gate_smoke_bulk_tool',
      { note: '大批量动作无阈值断言' },
      ctx,
    );
    assert(
      isPendingEnvelope(rBig.output),
      'G4: 50 位对象批量与单人走完全相同确认流程（无阈值豁免，D28）',
    );
    const bigHarm = (rBig.output as { harm: { targets: string[] } }).harm;
    assert(
      bigHarm.targets.length === 50,
      'G4: 大批量 harm 列全部 50 位对象（不折叠）',
    );
    createdPA.push(
      (rBig.output as { pendingActionId: string }).pendingActionId,
    );

    // ── G5：两步票据——confirm 签票 → execute 消费票 → 同事务 executed + irrev ──
    const conf = await confirmPendingAction(env.pendingActionId, ctx);
    assert(
      conf.confirmed === true && /^[a-f0-9]{64}$/.test(conf.ticket),
      'G5: confirm 签发一次性执行票（票仅在 confirm 响应出现一次）',
    );
    assert(
      (await countSent(ctx.tenantId)) === before,
      'G5: confirm 只签票不执行（副作用仍未发生）',
    );
    let pa = await prisma.pendingAction.findUnique({
      where: { id: env.pendingActionId },
    });
    assert(
      pa?.status === 'confirmed',
      'G5: confirm 后 status=confirmed（7 态中间态）',
    );
    assert(!!pa?.decidedAt, 'G5: decidedAt 记录人裁决时刻');
    assert(
      pa?.ticketHash === sha256(conf.ticket) && pa.ticketHash !== conf.ticket,
      'G5: DB 只存票 hash（sha256），明文不落库',
    );
    const confirmLog = await prisma.operationLog.count({
      where: {
        tenantId: ctx.tenantId,
        kind: 'gate',
        ref: env.pendingActionId,
        summary: { contains: '签发执行票' },
      },
    });
    assert(confirmLog === 1, 'G5: 确认=签票写 gate 留痕（§9.3.2）');
    assert(
      await expectGateError(
        () => confirmPendingAction(env.pendingActionId, ctx),
        'GATE_ALREADY_DECIDED',
      ),
      'G5: 重复确认 → 409 GATE_ALREADY_DECIDED',
    );

    const exec = await executePendingAction(
      env.pendingActionId,
      conf.ticket,
      ctx,
    );
    assert(exec.executed === true, 'G5: 消费票执行成功');
    assert(
      (await countSent(ctx.tenantId)) === before + 1,
      'G5: 执行后副作用真发生（SENT 留痕 +1）',
    );
    const irrev = await prisma.operationLog.count({
      where: {
        tenantId: ctx.tenantId,
        kind: 'irrev',
        ref: env.pendingActionId,
      },
    });
    assert(
      irrev === 1,
      'G5: 同一事务写一条 OperationLog kind:irrev（executed+irrev+业务态变更）',
    );
    pa = await prisma.pendingAction.findUnique({
      where: { id: env.pendingActionId },
    });
    assert(pa?.status === 'executed', 'G5: PendingAction 置 executed');
    assert(!!pa?.ticketUsedAt, 'G5: ticketUsedAt 记录消费时刻（重放挡板）');
    assert(
      !!pa?.confirmationTokenHash &&
        /^[a-f0-9]{64}$/.test(pa.confirmationTokenHash),
      'G5: 内部确认令牌只存 sha256 hash（不出进程，ADR-25）',
    );
    assert(
      await expectGateError(
        () => executePendingAction(env.pendingActionId, conf.ticket, ctx),
        'GATE_ALREADY_DECIDED',
      ),
      'G5: 票重放 → 409 GATE_ALREADY_DECIDED',
    );

    // ── G5.5（F003）：触达落库与状态推进（与 executed+irrev 同一事务的业务态变更）──
    const sentMsg = await prisma.outreachMessage.findFirst({
      where: {
        tenantId: ctx.tenantId,
        gateLogId: env.pendingActionId,
        direction: 'sent',
      },
    });
    assert(
      !!sentMsg,
      'G5.5: OutreachMessage(direction=sent, gateLogId=PA.id) 落库（:468 sent 必非空）',
    );
    assert(!!sentMsg?.sentAt, 'G5.5: sentAt 记录发送时刻');
    const fxThread = await prisma.outreachThread.findUnique({
      where: {
        projectId_kolId: { projectId: fx.projectId, kolId: fx.kolId },
      },
    });
    assert(
      fxThread?.status === 'sent',
      'G5.5: OutreachThread.status 经 crmInfer 推进 pending_send → sent（三处复用铁律）',
    );
    const advanceLog = await prisma.operationLog.count({
      where: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        projectId: fx.projectId,
        summary: { contains: '触达状态推进' },
      },
    });
    assert(
      advanceLog === 1,
      'G5.5: 状态推进事件留痕（OperationLog kind:auto + payloadJson）',
    );

    // ── G6：分码负例（403 / 410）+ reject 真实 rejected 态 ──
    const paA = await newPending(ctx, fx, 'G6-a 未确认先执行/伪票/票过期');
    createdPA.push(paA);
    assert(
      await expectGateError(
        () => executePendingAction(paA, 'f'.repeat(64), ctx),
        'GATE_TOKEN_INVALID',
      ),
      'G6: 未确认先执行 → 403 GATE_TOKEN_INVALID',
    );
    const confA = await confirmPendingAction(paA, ctx);
    assert(
      await expectGateError(
        () => executePendingAction(paA, '0'.repeat(64), ctx),
        'GATE_TOKEN_INVALID',
      ),
      'G6: 伪票 → 403 GATE_TOKEN_INVALID',
    );
    await prisma.pendingAction.update({
      where: { id: paA },
      data: { ticketExpiresAt: new Date(Date.now() - 1000) },
    });
    assert(
      await expectGateError(
        () => executePendingAction(paA, confA.ticket, ctx),
        'GATE_EXPIRED',
      ),
      'G6: 票 TTL 过期 → 410 GATE_EXPIRED',
    );
    assert(
      (await prisma.pendingAction.findUnique({ where: { id: paA } }))
        ?.status === 'expired',
      'G6: 票过期惰性翻转 confirmed → expired',
    );

    const paB = await newPending(ctx, fx, 'G6-b pending 过期');
    createdPA.push(paB);
    await prisma.pendingAction.update({
      where: { id: paB },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert(
      await expectGateError(
        () => confirmPendingAction(paB, ctx),
        'GATE_EXPIRED',
      ),
      'G6: 确认窗过期 → 410 GATE_EXPIRED',
    );
    assert(
      (await prisma.pendingAction.findUnique({ where: { id: paB } }))
        ?.status === 'expired',
      'G6: 确认窗过期惰性翻转 pending → expired',
    );
    assert(
      await expectGateError(
        () => getPendingActionDetail('nonexistent-id', ctx),
        'GATE_NOT_FOUND',
      ),
      'G6: 不存在的 actionId → 404 GATE_NOT_FOUND',
    );

    const paC = await newPending(ctx, fx, 'G6-c 拒绝');
    createdPA.push(paC);
    await rejectPendingAction(paC, ctx);
    const paCRow = await prisma.pendingAction.findUnique({
      where: { id: paC },
    });
    assert(
      paCRow?.status === 'rejected',
      'G6: reject 写真实 rejected 态（清 v0 expiresAt=epoch 债）',
    );
    assert(!!paCRow?.decidedAt, 'G6: reject 记录 decidedAt');
    assert(
      !!paCRow?.expiresAt &&
        paCRow.expiresAt.getTime() > Date.parse('2000-01-01'),
      'G6: reject 不再篡改 expiresAt（真实态非 epoch 失效）',
    );
    const block = await prisma.operationLog.count({
      where: { tenantId: ctx.tenantId, kind: 'block', ref: paC },
    });
    assert(block === 1, 'G6: 拒绝 → 写一条 OperationLog kind:block');
    assert(
      await expectGateError(
        () => confirmPendingAction(paC, ctx),
        'GATE_ALREADY_DECIDED',
      ),
      'G6: 已拒绝后确认 → 409 GATE_ALREADY_DECIDED',
    );

    // ── G7：7 态断言（枚举全量 + failed + executing 认账）──
    const seven = [
      'pending',
      'confirmed',
      'executing',
      'executed',
      'failed',
      'rejected',
      'expired',
    ];
    const enumVals = Object.values(PendingActionStatus);
    assert(
      enumVals.length === 7 &&
        seven.every((v) => enumVals.includes(v as never)),
      'G7: PendingActionStatus 枚举 7 态全量在场',
    );

    const rFail = await executeTool(
      'gate_smoke_failing_tool',
      { note: 'G7 failed 态' },
      ctx,
    );
    assert(
      isPendingEnvelope(rFail.output),
      'G7: 测试工具（outbound）同样被闸门拦截',
    );
    const paD = (rFail.output as { pendingActionId: string }).pendingActionId;
    createdPA.push(paD);
    const confD = await confirmPendingAction(paD, ctx);
    let failedThrew = false;
    try {
      await executePendingAction(paD, confD.ticket, ctx);
    } catch (err) {
      failedThrew = !(err instanceof GateError); // 原始副作用错误上抛（非闸门分码错）
    }
    assert(failedThrew, 'G7: 副作用失败 → 原始错误上抛');
    assert(
      (await prisma.pendingAction.findUnique({ where: { id: paD } }))
        ?.status === 'failed',
      'G7: 副作用失败 → status=failed',
    );
    assert(
      (await prisma.operationLog.count({
        where: { tenantId: ctx.tenantId, kind: 'irrev', ref: paD },
      })) === 0,
      'G7: failed 无 irrev 行（业务写入随事务回滚）',
    );

    const paF = await newPending(ctx, fx, 'G7 executing 认账');
    createdPA.push(paF);
    await prisma.pendingAction.update({
      where: { id: paF },
      data: { status: 'executing' },
    });
    assert(
      (await getPendingActionDetail(paF, ctx)).status === 'executing',
      'G7: executing 瞬态可被 GET 详情如实返回',
    );
    assert(
      await expectGateError(
        () => confirmPendingAction(paF, ctx),
        'GATE_ALREADY_DECIDED',
      ),
      'G7: executing 态确认 → 409（状态机认账）',
    );
    assert(
      await expectGateError(
        () => executePendingAction(paF, 'f'.repeat(64), ctx),
        'GATE_ALREADY_DECIDED',
      ),
      'G7: executing 态执行 → 409（状态机认账）',
    );

    // ── G8：并发竞态（消 R15，原子条件 UPDATE 败者 409）──
    const paE = await newPending(ctx, fx, 'G8 并发双确认');
    createdPA.push(paE);
    const confRace = await Promise.allSettled([
      confirmPendingAction(paE, ctx),
      confirmPendingAction(paE, ctx),
    ]);
    const confWins = confRace.filter((r) => r.status === 'fulfilled');
    const confLosses = confRace.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    assert(
      confWins.length === 1,
      'G8: 并发双确认恰一方胜出（原子条件 UPDATE WHERE status=pending）',
    );
    assert(
      confLosses.length === 1 &&
        confLosses[0].reason instanceof GateError &&
        confLosses[0].reason.code === 'GATE_ALREADY_DECIDED',
      'G8: 并发确认败者 → 409 GATE_ALREADY_DECIDED',
    );

    const winTicket = (
      confWins[0] as PromiseFulfilledResult<
        Awaited<ReturnType<typeof confirmPendingAction>>
      >
    ).value.ticket;
    const beforeRace = await countSent(ctx.tenantId);
    const execRace = await Promise.allSettled([
      executePendingAction(paE, winTicket, ctx),
      executePendingAction(paE, winTicket, ctx),
    ]);
    assert(
      execRace.filter((r) => r.status === 'fulfilled').length === 1,
      'G8: 并发双消费同一票恰一方胜出（WHERE confirmed AND ticketUsedAt IS NULL）',
    );
    assert(
      (await countSent(ctx.tenantId)) === beforeRace + 1,
      'G8: 副作用恰好一次（并发下不双发）',
    );

    // ── ★D20 变异测试：把拦截退回原状（直调 tool.execute 绕过 executeTool 门控）──
    const beforeMut = await countSent(ctx.tenantId);
    const tool = getTool('send_outreach')!;
    await tool.execute(
      {
        projectId: fx.projectId,
        kolId: fx.kolId,
        subject: '变异：直调绕过闸门',
        body: '变异测试正文',
      } as never,
      ctx,
    ); // = 拦截退回原状
    const afterMut = await countSent(ctx.tenantId);
    const g1AssertionWouldGoRed = afterMut > beforeMut; // 副作用 DID 发生
    assert(
      g1AssertionWouldGoRed,
      'D20 变异测试：退回拦截（直调 execute 绕过 executeTool 门控）→ 副作用发生 → G1「无副作用」断言必然变红（证 G1 验行为、非验源码关键字）',
    );

    console.log(
      '[gate-smoke] ✅ 全部断言通过（两步票据 + 7 态 + 并发竞态 + D20 变异）',
    );
  } finally {
    // 清理本测试产生的 PendingAction + OperationLog（SENT/gate/irrev/block/auto/变异）
    // + F003 夹具（project 级联 thread/message；再删合成 KOL）。
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, summary: { contains: SENT_MARKER } },
    });
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, projectId: fx.projectId },
    });
    if (createdPA.length) {
      await prisma.operationLog.deleteMany({
        where: { tenantId: ctx.tenantId, ref: { in: createdPA } },
      });
      await prisma.pendingAction.deleteMany({
        where: { id: { in: createdPA } },
      });
    }
    await prisma.project.deleteMany({ where: { id: fx.projectId } });
    await prisma.kol.deleteMany({ where: { id: fx.kolId } });
    console.log('[gate-smoke] 测试数据已清理（含 F003 夹具）');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[gate-smoke] ❌ 失败：',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
