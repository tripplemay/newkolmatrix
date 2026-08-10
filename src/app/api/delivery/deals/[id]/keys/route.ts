// M3-B-DELIVERY F008 — POST /api/delivery/deals/[id]/keys：key 池登记（P8）
//
// internal（可撤销、不对外、不花钱，D27）：登记的是**引用不是明文 key 值**——
// 形似激活码的入参在服务层被拒（lib/delivery/key-ref.ts 写入口守卫）。
// 登记后条目为 reserved，实际发放须经 distribute_keys 闸门（F006）。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

// M5.2-TENANT-COVERAGE F003 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】registerKeyPool 只写 KeyRef 条目 + 留痕，全是 DB，用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { registerKeysSchema } from 'lib/data/schemas/delivery';
import {
  badRequest,
  deliveryErrorResponse,
  deliveryRateLimitGuard,
  parseJsonBody,
} from 'lib/delivery/http';
import { registerKeyPool } from 'lib/delivery/register';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = deliveryRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const parsed = registerKeysSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) return badRequest(parsed.error);
    const tenantId = await requireSessionTenantId();
    const result = await withSessionTenant(() =>
      registerKeyPool(id, parsed.data, { tenantId, actor: 'operator' }),
    );
    return Response.json(result);
  } catch (error) {
    return deliveryErrorResponse(error);
  }
}
