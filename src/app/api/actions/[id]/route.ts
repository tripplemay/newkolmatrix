// M3-A-REACH-CRM F002 — GET /api/actions/[id]：待确认动作详情（§9.3.2 四端点之一）
//
// 供确认卡刷新 / 跨会话恢复：返回 harm 披露与状态，**不含** inputJson / 任何 hash / 票据。
// 惰性过期翻转在服务层完成。运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

// M5.2-TENANT-COVERAGE F001 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
import { buildToolContext } from 'lib/agent/context';
import { getPendingActionDetail } from 'lib/agent/gate/gate';
import { actionsRateLimitGuard, gateErrorResponse } from 'lib/agent/gate/http';
import { withSessionTenant } from 'lib/db/tenant-entry';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = actionsRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const ctx = await buildToolContext();
    const detail = await withSessionTenant(() => getPendingActionDetail(id, ctx));
    return Response.json(detail);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
