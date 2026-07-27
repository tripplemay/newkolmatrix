// [Evaluator 复验产物] 真挂死上游 + **不注入任何 abortSignal / consultTimeoutMs**
// → 验证生产默认闸（registry 常量）是否真的在场并生效。
import http from 'node:http';
import { prisma } from '../../../src/lib/db/prisma';
import { getNativeToolNames } from '../../../src/lib/agent/tools';
import { executeTool } from '../../../src/lib/agent/execute';
import {
  FRONT_DESK_AGENT_ID,
  SPECIALIST_TIMEOUT_MS,
  LOOP_TIMEOUT_MS,
} from '../../../src/lib/agent/registry';
import { CONSULT_FAILED_MARKER } from '../../../src/lib/agent/tools/consult-specialist';
import { runAgentLoop } from '../../../src/lib/agent/loop';
import type { ToolContext } from '../../../src/lib/agent/tools/types';

const SLUG = `rv-${process.pid}-timeout`;

async function main() {
  getNativeToolNames();
  const srv = http.createServer(() => { /* 收下请求，永不响应 */ });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  process.env.AIGCGATEWAY_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AIGCGATEWAY_API_KEY = 'rv-dummy-key';

  const t = await prisma.tenant.create({ data: { slug: SLUG, name: SLUG } });
  const p = await prisma.project.create({ data: { tenantId: t.id, name: SLUG } });
  const ctx: ToolContext = {
    tenantId: t.id, agentId: FRONT_DESK_AGENT_ID, projectId: p.id, env: 'default',
    consultBudget: { used: 0, max: 2 },
    // 刻意**不给** consultTimeoutMs —— 走生产默认
  };
  const ledger: Record<string, unknown> = {
    SPECIALIST_TIMEOUT_MS, LOOP_TIMEOUT_MS,
  };

  // ── A：consult_specialist 走生产默认闸 ─────────────────────────
  const t0 = Date.now();
  const res = (await executeTool('consult_specialist',
    { targetAgent: 'insight', question: 'rv 探针：ROI？' }, ctx)) as
    { output: { ok: boolean; failureReason?: string; answer: string } };
  const elapsedA = Date.now() - t0;
  ledger['A.elapsedMs'] = elapsedA;
  ledger['A.ok'] = res.output.ok;
  ledger['A.failureReason'] = res.output.failureReason;
  ledger['A.answer'] = res.output.answer;
  ledger['A.loggedRows'] = await prisma.operationLog.count({
    where: { tenantId: t.id, summary: { contains: CONSULT_FAILED_MARKER } },
  });
  ledger['A.withinGate'] = elapsedA < SPECIALIST_TIMEOUT_MS + 8000;
  ledger['A.notUndiciFallback'] = elapsedA < 250_000;

  // ── B：主 loop 走生产默认闸（不注入 model / abortSignal）────────
  const t1 = Date.now();
  let bErr = '';
  let bText = '';
  try {
    const r = await runAgentLoop({
      copilot: { route: '/admin', projectId: null, env: 'default', agentId: FRONT_DESK_AGENT_ID },
      messages: [{ role: 'user', content: 'rv 探针：主 loop 挂死' }],
      ctx,
    });
    for await (const _ of r.result.textStream) bText += _;
  } catch (e) {
    bErr = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 100) : String(e);
  }
  const elapsedB = Date.now() - t1;
  ledger['B.elapsedMs'] = elapsedB;
  ledger['B.err'] = bErr;
  ledger['B.text'] = bText;
  ledger['B.withinGate'] = elapsedB < LOOP_TIMEOUT_MS + 8000;

  console.log('[rv-timeout-wire]', JSON.stringify(ledger, null, 2));

  srv.close();
  // 逐表清 + 逐表断言
  await prisma.handoff.deleteMany({ where: { tenantId: t.id } });
  await prisma.operationLog.deleteMany({ where: { tenantId: t.id } });
  await prisma.pendingAction.deleteMany({ where: { tenantId: t.id } });
  await prisma.shareLink.deleteMany({ where: { tenantId: t.id } });
  await prisma.project.deleteMany({ where: { tenantId: t.id } });
  await prisma.tenant.deleteMany({ where: { id: t.id } });
  const left = {
    handoff: await prisma.handoff.count({ where: { tenantId: t.id } }),
    operationLog: await prisma.operationLog.count({ where: { tenantId: t.id } }),
    pendingAction: await prisma.pendingAction.count({ where: { tenantId: t.id } }),
    shareLink: await prisma.shareLink.count({ where: { tenantId: t.id } }),
    project: await prisma.project.count({ where: { tenantId: t.id } }),
    tenant: await prisma.tenant.count({ where: { slug: SLUG } }),
  };
  console.log('[rv-timeout-wire] leftover', JSON.stringify(left));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
