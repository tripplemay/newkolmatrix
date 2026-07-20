// AGENT-FOUNDATION F007 — 持久 demo handoff（供协同交接可视化渲染）
//
// F007 acceptance 要求「至少渲染 F006 演示的那次 handoff」。orch:smoke 的 handoff 跑完即清理，
// 故这里灌一条持久的 demo handoff（match→reach）供 CopilotPanel 的 HandoffCollab 展示。
// 幂等：按固定 artifactRef 标记 upsert（存在则跳过）。
//
// 运行：npm run seed:demo-handoff

import { getDevTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';

const DEMO_REF = 'match_plan:demo-starlight-protocol';

async function main(): Promise<void> {
  const tenantId = await getDevTenantId();
  const existing = await prisma.handoff.findFirst({
    where: { tenantId, artifactRef: DEMO_REF },
  });
  if (existing) {
    console.log('[demo-handoff] 已存在，跳过（幂等）');
    return;
  }
  const row = await prisma.handoff.create({
    data: {
      tenantId,
      projectId: 'demo-starlight-protocol',
      fromAgent: 'match',
      toAgent: 'reach',
      artifactType: 'match_plan',
      artifactRef: DEMO_REF,
      summary:
        '匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选（受众吻合、可信度已核），交触达 Agent 起草邀约。',
      messagesJson: [
        { role: 'agent', content: '已完成候选筛查与受众匹配，交接给触达 Agent' },
        { role: 'agent', content: '接收：将按自身 scope 重读候选数据后起草逐人邀约' },
      ],
    },
    select: { id: true },
  });
  console.log(`[demo-handoff] ✅ 已灌 demo handoff（match→reach）id=${row.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[demo-handoff] ❌', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
