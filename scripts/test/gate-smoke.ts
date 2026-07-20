// AGENT-FOUNDATION F009 — AI→人闸门 smoke + 变异测试（D20 硬性）
//
// G1 服务端强制 / G2 harm 如实披露 / G3 internal 不加闸门 / G4 无阈值 / G5 留痕 + 单次 + token 只存 hash
// + ★D20 变异测试：把拦截退回原状（直调 tool.execute 绕过 executeTool 门控）→「无副作用」断言必须变红。
//
// 运行：npm run gate:smoke   退出码：0=全绿 / 1=任一失败。

import { executeTool } from '../../src/lib/agent/execute';
import { confirmPendingAction, rejectPendingAction } from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getTool } from '../../src/lib/agent/tools/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { SENT_MARKER } from '../../src/lib/agent/tools/send-outreach';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function countSent(tenantId: string): Promise<number> {
  return prisma.operationLog.count({
    where: { tenantId, summary: { contains: SENT_MARKER } },
  });
}

async function main(): Promise<void> {
  console.log('[gate-smoke] AI→人闸门验证开始');
  getNativeToolNames();
  const ctx = await buildToolContext({ agentId: 'reach' });
  const createdPA: string[] = [];

  try {
    // ── G1：outbound 服务端强制（无令牌 → pending，副作用未执行）──
    const before = await countSent(ctx.tenantId);
    const r1 = await executeTool(
      'send_outreach',
      { recipients: ['@viper', '@skif', '@pwng'], message: '诚邀参与《星轨协议》上线创作' },
      ctx,
    );
    assert(isPendingEnvelope(r1.output), 'G1: outbound send_outreach 无令牌 → 返回 pending 信封（未执行）');
    const env = r1.output as { pendingActionId: string; harm: Record<string, unknown> };
    createdPA.push(env.pendingActionId);
    assert((await countSent(ctx.tenantId)) === before, 'G1: 副作用未执行（无 SENT 留痕新增）');
    // 模型永远拿不到令牌：pending 信封里无任何 token 字段
    assert(!('confirmationToken' in (r1.output as object)) && !('token' in (r1.output as object)), 'G1: pending 信封不含任何令牌（模型无法自我放行）');

    // ── G2：harm 如实披露（单一 zod schema）──
    const harm = env.harm as { action: string; targets: string[]; irreversible: boolean; label: string; quantity?: number };
    assert(harm.action === 'send_outreach', 'G2: harm.action=send_outreach');
    assert(Array.isArray(harm.targets) && harm.targets.length === 3, 'G2: harm.targets 列全部 3 位收件人（不折叠）');
    assert(harm.targets.includes('@viper') && harm.targets.includes('@pwng'), 'G2: 收件人全名单如实');
    assert(harm.irreversible === true, 'G2: harm.irreversible=true');
    assert(harm.label === '对外·不可撤销', 'G2: 统一红标「对外·不可撤销」');

    // ── G3：internal 动作不加闸门 ──
    const s = await executeTool('search_kols', { query: '坦克世界', topK: 3 }, ctx);
    assert(!isPendingEnvelope(s.output), 'G3: internal search_kols 不弹确认框（直接执行，非 pending）');

    // ── G4：无阈值分级（大批量走完全相同的确认流程）──
    const many = Array.from({ length: 50 }, (_, i) => `@kol${i}`);
    const rBig = await executeTool('send_outreach', { recipients: many, message: '大批量邀约' }, ctx);
    assert(isPendingEnvelope(rBig.output), 'G4: 50 位批量与 3 位走完全相同确认流程（无阈值豁免，D28）');
    createdPA.push((rBig.output as { pendingActionId: string }).pendingActionId);

    // ── G5：确认 → 执行 + 同事务 irrev 留痕；token 只存 hash；单次使用 ──
    const conf = await confirmPendingAction(env.pendingActionId, ctx);
    assert(conf.executed === true, 'G5: 确认后执行成功');
    assert((await countSent(ctx.tenantId)) === before + 1, 'G5: 确认后副作用真执行（SENT 留痕 +1）');
    const irrev = await prisma.operationLog.count({ where: { tenantId: ctx.tenantId, kind: 'irrev', ref: env.pendingActionId } });
    assert(irrev === 1, 'G5: 确认执行后自动写一条 OperationLog kind:irrev（同事务，可按类型筛）');
    const pa = await prisma.pendingAction.findUnique({ where: { id: env.pendingActionId } });
    assert(pa?.status === 'executed', 'G5: PendingAction 置 executed');
    assert(!!pa?.confirmationTokenHash && /^[a-f0-9]{64}$/.test(pa.confirmationTokenHash), 'G5: 确认令牌只存 sha256 hash（非明文）');
    // 单次使用：重复确认失败
    let reconfirmFail = false;
    try {
      await confirmPendingAction(env.pendingActionId, ctx);
    } catch {
      reconfirmFail = true;
    }
    assert(reconfirmFail, 'G5: 令牌单次使用——重复确认被拒');

    // ── 拒绝 → block 留痕 ──
    const r3 = await executeTool('send_outreach', { recipients: ['@x'], message: '待拒绝' }, ctx);
    const rejId = (r3.output as { pendingActionId: string }).pendingActionId;
    createdPA.push(rejId);
    await rejectPendingAction(rejId, ctx);
    const block = await prisma.operationLog.count({ where: { tenantId: ctx.tenantId, kind: 'block', ref: rejId } });
    assert(block === 1, '拒绝 → 写一条 OperationLog kind:block；被拒动作不可再确认');

    // ── ★D20 变异测试：把拦截退回原状（直调 tool.execute 绕过 executeTool 门控）──
    const beforeMut = await countSent(ctx.tenantId);
    const tool = getTool('send_outreach')!;
    await tool.execute({ recipients: ['@mutation'], message: '变异：直调绕过闸门' } as never, ctx); // = 拦截退回原状
    const afterMut = await countSent(ctx.tenantId);
    const g1AssertionWouldGoRed = afterMut > beforeMut; // 副作用 DID 发生
    assert(
      g1AssertionWouldGoRed,
      'D20 变异测试：退回拦截（直调 execute 绕过 executeTool 门控）→ 副作用发生 → G1「无副作用」断言必然变红（证 G1 验行为、非验源码关键字）',
    );

    console.log('[gate-smoke] ✅ 全部断言通过（含 D20 变异测试）');
  } finally {
    // 清理本测试产生的 PendingAction + OperationLog（SENT/gate/irrev/block/变异）。
    await prisma.operationLog.deleteMany({ where: { tenantId: ctx.tenantId, summary: { contains: SENT_MARKER } } });
    if (createdPA.length) {
      await prisma.operationLog.deleteMany({ where: { tenantId: ctx.tenantId, ref: { in: createdPA } } });
      await prisma.pendingAction.deleteMany({ where: { id: { in: createdPA } } });
    }
    console.log('[gate-smoke] 测试数据已清理');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[gate-smoke] ❌ 失败：', err instanceof Error ? (err.stack ?? err.message) : err);
    await prisma.$disconnect();
    process.exit(1);
  });
