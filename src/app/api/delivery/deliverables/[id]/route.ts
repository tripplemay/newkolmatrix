// M3-B-DELIVERY F008 — PATCH /api/delivery/deliverables/[id]：交付条件人工核验（P4）
//
// internal（可撤销、不对外、不花钱，D27）：met / missing / na 三态 + 证据引用 + 核验人。
// 人的核验优先于任何自动判定（F003 关键词判 key 交付判错时，从这里改回来）。
// 响应带重算后的 deliveryCheck 结果——调用方立刻知道这次核验有没有把 ready 变过来。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { getDevTenantId } from 'lib/agent/context';
import { verifyDeliverableSchema } from 'lib/data/schemas/delivery';
import {
  badRequest,
  deliveryErrorResponse,
  deliveryRateLimitGuard,
  parseJsonBody,
} from 'lib/delivery/http';
import { verifyDeliverable } from 'lib/delivery/register';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = deliveryRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const parsed = verifyDeliverableSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) return badRequest(parsed.error);
    const tenantId = await getDevTenantId();
    const result = await verifyDeliverable(id, parsed.data, {
      tenantId,
      actor: 'operator',
    });
    return Response.json(result);
  } catch (error) {
    return deliveryErrorResponse(error);
  }
}
