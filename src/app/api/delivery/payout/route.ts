// M3-B-DELIVERY F009 — POST /api/delivery/payout：V7「放款」入口（executeTool 薄封装）
//
// 经唯一执行入口触发 payout（outbound）→ 返回 pending 信封（副作用零发生），
// 前端凭 pendingActionId 走真链路：GET /api/actions/[id] 详情 → confirm → execute
//（沿 M3-A F008 /api/reach/send 同款范式）。
//
// 条件未齐时 payout.buildHarm 在**落 PendingAction 之前**抛错（P6）→ 本端点 400 原文透传，
// 前端把服务端原话显示给人（「缺什么显什么」）——不在前端重新判定、不改写理由。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';
import { deliveryRateLimitGuard } from 'lib/delivery/http';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectId: z.string().min(1),
  dealId: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const limited = deliveryRateLimitGuard(req);
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
    const { projectId, dealId } = parsed.data;
    const ctx = await buildToolContext({ agentId: 'delivery', projectId });
    const result = await executeTool('payout', { dealId }, ctx);
    if (!isPendingEnvelope(result.output)) {
      // outbound 必须停在闸门——拿到非 pending 信封说明闸门被绕过，拒绝并报警
      console.error('[api/delivery/payout] outbound 未停在闸门:', result.output);
      return Response.json(
        { error: '放款未按闸门流程停下，已拒绝' },
        { status: 500 },
      );
    }
    return Response.json({
      pendingActionId: result.output.pendingActionId,
      harm: result.output.harm,
    });
  } catch (error) {
    // 服务端拒绝原文透传（条件未齐 / 交易不存在 / 缺金额）——前端原样展示，不改写
    const message =
      error instanceof Error ? error.message : '放款发起失败，请重试';
    return Response.json({ error: message }, { status: 400 });
  }
}
