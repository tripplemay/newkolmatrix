// M4.5-AGENT-LOOP F004 — POST /api/agent/plan-ack：认可一份行动计划（internal，U3/P4/P6）
//
// 语义：只落一行留痕。**不解锁任何执行权**——计划里需要确认的动作照旧逐个走两步票据闸门
//（回归测试 propose-plan.test.ts 钉死）。故本端点无 PendingAction、无令牌、无弹窗。
// 幂等由服务层保证（同计划重复认可不重复留痕）。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { getDevTenantId } from 'lib/agent/context';
import { agentRateLimitGuard } from 'lib/agent/http';
import { acknowledgePlan, PLAN_NOT_FOUND_MSG } from 'lib/agent/plan-ack';

export const runtime = 'nodejs';

const bodySchema = z.object({
  planId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const limited = agentRateLimitGuard(req);
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
    const result = await acknowledgePlan(parsed.data.planId, { tenantId });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '认可失败，请重试';
    const status = message.includes(PLAN_NOT_FOUND_MSG) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
