// M4.5-AGENT-LOOP F004 — POST /api/agent/plan-ack：认可一份行动计划（internal，U3/P4/P6）
//
// 语义：只落一行留痕。**不解锁任何执行权**——计划里需要确认的动作照旧逐个走两步票据闸门
//（回归测试 propose-plan.test.ts 钉死）。故本端点无 PendingAction、无令牌、无弹窗。
// 幂等由服务层保证（同计划重复认可不重复留痕）。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】acknowledgePlan 只写「计划已认可」留痕。**与 F001 的 execute 路径不冲突**（acceptance ③）：
// 认可只留痕、**不解锁执行权**（M4.5 行动计划卡语义），本路由不碰 PendingAction、
// 不调 gate 的任何函数，因此不存在「从作用域内调 executePendingAction」那种嵌套，全是 DB，用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
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
    const tenantId = await requireSessionTenantId();
    const result = await withSessionTenant(() =>
      acknowledgePlan(parsed.data.planId, { tenantId }),
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '认可失败，请重试';
    const status = message.includes(PLAN_NOT_FOUND_MSG) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
