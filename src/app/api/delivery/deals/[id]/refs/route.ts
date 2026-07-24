// M3-B-DELIVERY F008 — POST /api/delivery/deals/[id]/refs：登记合同 / 托管单号（P4）
//
// internal（可撤销、不对外、不花钱，D27）：不过闸门，但写 OperationLog 留痕。
// 登记即把对应条件置 met + 推进 Deal 状态（signed / escrowed）——服务层同一事务完成。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { getDevTenantId } from 'lib/agent/context';
import { registerRefsSchema } from 'lib/data/schemas/delivery';
import {
  badRequest,
  deliveryErrorResponse,
  deliveryRateLimitGuard,
  parseJsonBody,
} from 'lib/delivery/http';
import { registerDealRefs } from 'lib/delivery/register';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = deliveryRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const parsed = registerRefsSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) return badRequest(parsed.error);
    const tenantId = await getDevTenantId();
    const result = await registerDealRefs(id, parsed.data, {
      tenantId,
      actor: 'operator',
    });
    return Response.json(result);
  } catch (error) {
    return deliveryErrorResponse(error);
  }
}
