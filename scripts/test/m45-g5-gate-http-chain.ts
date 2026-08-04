// M4.5-AGENT-LOOP verify-G5（Evaluator 独立探针，非产品代码）——F007 批量确认动线的 **HTTP 全链**补盲
//
// 【为什么必须补这一条】framework/patterns/testing-env-patterns.md §8（M3-A round1 critical 沉淀）：
// 「服务层测试 ≠ HTTP 链测试」。M3-A 的 payloadHash 中毒被 gate-smoke + reach-e2e **双绿漏检**，
// 因为两者都是服务函数直调；真实主路径（页面 POST → confirm）反而恒 403。
// F007 的「依次确认」在浏览器里走的是 **fetch → 真 route handler**，而 batch-confirm.test.ts /
// agentloop-e2e.ts 的 BatchPost 注入都把 URL 派回服务层——真 route 这一段全仓无任何用例。
// 本脚本让 confirmAndExecuteSequentially 的传输层直驱**真的 route handler**，把这段补上。
//
// 【前置】本机 Postgres localhost:5434 已起（`npm run db:up`）；`npx prisma generate` 已跑。
// 【副作用与清态】route handler 的租户来自登录会话（M5-AUTH-RLS F004）；本脚本是进程内直调、
// 无会话，故显式走 systemContext(DEV_TENANT_SLUG) 指名 dev 租户 → 本脚本
// **不可避免地**在 dev 租户造 1 件 pending 并真的执行（mock 分享通道，零真实公开暴露）。
// 故：跑前拍快照 → 跑完按 id 差集精确回删 → 复拍快照核证与跑前完全一致（含 SHARE_CREATED
// 标记行——§9 那条「清态不能只按 ref=PA.id 清」的坑本脚本正面处理）。
//
// 运行：node --env-file=.env --import tsx scripts/test/m45-g5-gate-http-chain.ts   退出码 0=全绿

import { prisma } from '../../src/lib/db/prisma';
import {
  DEV_TENANT_SLUG,
  systemContext,
} from '../../src/lib/agent/context';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import {
  confirmAndExecuteSequentially,
  type BatchPost,
} from '../../src/lib/gate/batch-confirm';
import { POST as confirmRoute } from '../../src/app/api/actions/[id]/confirm/route';
import { POST as executeRoute } from '../../src/app/api/actions/[id]/execute/route';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

/** 传输层 = 真 route handler（不是服务函数直调）——本脚本存在的全部意义。 */
const httpPost: BatchPost = async (url, body) => {
  const m = url.match(/^\/api\/actions\/([^/]+)\/(confirm|execute)$/);
  if (!m) return { ok: false, status: 404, body: { error: '未知端点' } };
  const [, id, action] = m;
  const req = new Request(`http://127.0.0.1${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const params = Promise.resolve({ id });
  const res =
    action === 'confirm'
      ? await confirmRoute(req, { params })
      : await executeRoute(req, { params });
  const parsed = (await res.json().catch((): null => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, body: parsed };
};

async function snapshot(tenantId: string) {
  const [logs, pas, shares] = await Promise.all([
    prisma.operationLog.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.pendingAction.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.shareLink.findMany({ where: { tenantId }, select: { id: true } }),
  ]);
  return {
    logs: logs.map((x) => x.id),
    pas: pas.map((x) => x.id),
    shares: shares.map((x) => x.id),
  };
}

async function main(): Promise<void> {
  delete process.env.AIGCGATEWAY_BASE_URL; // 零外呼：本脚本不碰模型
  delete process.env.AIGCGATEWAY_API_KEY;
  getNativeToolNames();
  const ctx = await systemContext(DEV_TENANT_SLUG, { agentId: 'insight' });
  const tenantId = ctx.tenantId;
  const before = await snapshot(tenantId);
  console.log(
    `[gate-http-chain] dev 租户跑前：logs=${before.logs.length} pending=${before.pas.length} share=${before.shares.length}`,
  );

  try {
    // ① 备一件 outbound（真闸门 → pending 停驻）
    const r = await executeTool('create_share_link', { scope: 'quarterly' }, ctx);
    assert(isPendingEnvelope(r.output), 'outbound 停在 pending（闸门在场）');
    const id = (r.output as { pendingActionId: string }).pendingActionId;

    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });

    // ② 走 F007 的批量执行器，但传输层是**真 route handler**
    const batch = await confirmAndExecuteSequentially([id], httpPost);
    assert(
      batch.succeeded === 1 && batch.failed === 0,
      '🔒 真 HTTP 路由全链：confirm → execute 逐项走通（M3-A 恒 403 一类回归会在此翻红）',
    );
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) === shareBefore + 1,
      '副作用恰好一次',
    );
    const pa = await prisma.pendingAction.findUnique({ where: { id } });
    assert(pa?.status === 'executed', 'PendingAction 落 executed');

    // ③ 票据一次性：同一 id 再来一遍必须失败且不产生第二次副作用
    const replay = await confirmAndExecuteSequentially([id], httpPost);
    assert(replay.failed === 1, '重放批量：已处理的动作被拒');
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) === shareBefore + 1,
      '重放零新增副作用',
    );

    // ④ execute 缺票据 → 403（前端拿不到票时不得误以为成功）
    const noTicket = await httpPost(`/api/actions/${id}/execute`);
    assert(
      noTicket.status === 403 && noTicket.body?.code === 'GATE_TOKEN_INVALID',
      '无票直调 execute → 403 GATE_TOKEN_INVALID',
    );

    console.log('[gate-http-chain] ✅ 全部断言通过');
  } finally {
    // 精确回删（按 id 差集，不做模式匹配）
    const after = await snapshot(tenantId);
    const newLogs = after.logs.filter((x) => !before.logs.includes(x));
    const newShares = after.shares.filter((x) => !before.shares.includes(x));
    const newPas = after.pas.filter((x) => !before.pas.includes(x));
    await prisma.shareLink.deleteMany({ where: { id: { in: newShares } } });
    await prisma.operationLog.deleteMany({ where: { id: { in: newLogs } } });
    await prisma.pendingAction.deleteMany({ where: { id: { in: newPas } } });
    const final = await snapshot(tenantId);
    const identical =
      JSON.stringify([...final.logs].sort()) ===
        JSON.stringify([...before.logs].sort()) &&
      JSON.stringify([...final.pas].sort()) ===
        JSON.stringify([...before.pas].sort()) &&
      JSON.stringify([...final.shares].sort()) ===
        JSON.stringify([...before.shares].sort());
    console.log(
      `[gate-http-chain] 清态：删 logs=${newLogs.length} shares=${newShares.length} pending=${newPas.length} → dev 租户${
        identical ? '与跑前完全一致 ✅' : '仍有残留 ❌'
      }`,
    );
    if (!identical) throw new Error('清态未归零');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[gate-http-chain] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
