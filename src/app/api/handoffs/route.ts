// AGENT-FOUNDATION F007 — GET /api/handoffs：列出租户的 handoff（协同交接可视化数据源）
//
// 读 F002 Handoff 表（F006 编排框架落盘的真实交接）。运行时 = nodejs（Prisma）。

import { prisma } from 'lib/db/prisma';
// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】只读 Handoff 列表，全是 DB，用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { describeGatewayError } from 'lib/ai/gateway';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const tenantId = await requireSessionTenantId();
    const rows = await withSessionTenant(() =>
      prisma.handoff.findMany({
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
      }),
    );
    return Response.json({ handoffs: rows });
  } catch (error) {
    return Response.json({ error: describeGatewayError(error), handoffs: [] }, { status: 500 });
  }
}
