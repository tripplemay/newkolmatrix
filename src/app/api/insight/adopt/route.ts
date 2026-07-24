// M4-INSIGHT F009/F010 — POST /api/insight/adopt：采纳复盘结论 / 采纳为周报（internal，P5）
//
// D16 语义：选了即生效——无 PendingAction、无闸门、无弹窗（前端 Toast 反馈）。
// 幂等由服务层保证（重复采纳不改写 adoptedAt，alreadyAdopted 如实返回）。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { getDevTenantId } from 'lib/agent/context';
import { adoptWeeklyReport } from 'lib/insight/weekly-report';
import { insightRateLimitGuard } from 'lib/insight/http';

export const runtime = 'nodejs';

const bodySchema = z.object({
  reportId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const limited = insightRateLimitGuard(req);
  if (limited) return limited;
  try {
    const parsed = bodySchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }
    const tenantId = await getDevTenantId();
    const r = await adoptWeeklyReport(parsed.data.reportId, { tenantId });
    return Response.json({
      reportId: r.reportId,
      adopted: r.adopted,
      adoptedAt: r.adoptedAt.toISOString(),
      alreadyAdopted: r.alreadyAdopted,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '采纳失败，请重试';
    // 服务层「报告不存在」明示错误 → 404；其余 400
    const status = /不存在/.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
