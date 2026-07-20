// AGENT-FOUNDATION F007 — GET /api/handoffs：列出租户的 handoff（协同交接可视化数据源）
//
// 读 F002 Handoff 表（F006 编排框架落盘的真实交接）。运行时 = nodejs（Prisma）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { describeGatewayError } from 'lib/ai/gateway';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const tenantId = await getDevTenantId();
    const rows = await prisma.handoff.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fromAgent: true,
        toAgent: true,
        artifactType: true,
        artifactRef: true,
        summary: true,
        createdAt: true,
      },
    });
    return Response.json({ handoffs: rows });
  } catch (error) {
    return Response.json({ error: describeGatewayError(error), handoffs: [] }, { status: 500 });
  }
}
