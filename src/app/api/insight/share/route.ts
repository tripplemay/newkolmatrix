// M4-INSIGHT F009 — POST /api/insight/share：V8/V12「生成对外分享报告」入口（executeTool 薄封装）
//
// 经唯一执行入口触发 create_share_link（outbound，白名单第 6）→ 返回 pending 信封
//（副作用零发生），前端凭 pendingActionId 走真链路：GET /api/actions/[id] 详情 →
// confirm → execute（沿 M3-B /api/delivery/payout 同款范式）。
// scope=project（V8，须带 projectId）/ scope=quarterly（V12 跨项目）——裁决 #3。
// buildHarm 阶段的明示拒绝（缺 projectId / 项目不存在）→ 400 原文透传，前端不改写。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';
// M5.2-TENANT-COVERAGE F003 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 表态：本路由**不涉外呼**，用默认事务时长】create_share_link 是 outbound，但它在此处被闸门
// 拦在确认前——只读条件 / 建 harm 披露、落 PendingAction + 留痕，全是 DB。真正的副作用
// （对外可见的分享链接）发生在 /api/actions/[id]/execute，那条按 spec D-3 裁决走领域层自带作用域。
import { insightRateLimitGuard } from 'lib/insight/http';
import { withSessionTenant } from 'lib/db/tenant-entry';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scope: z.enum(['project', 'quarterly']),
  projectId: z.string().min(1).nullish(),
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
    const { scope, projectId } = parsed.data;
    const ctx = await buildToolContext({
      agentId: 'insight',
      projectId: projectId ?? null,
    });
    const result = await withSessionTenant(() =>
      executeTool('create_share_link', { scope, projectId: projectId ?? null }, ctx),
    );
    if (!isPendingEnvelope(result.output)) {
      // outbound 必须停在闸门——拿到非 pending 信封说明闸门被绕过，拒绝并报警
      console.error('[api/insight/share] outbound 未停在闸门:', result.output);
      return Response.json(
        { error: '分享未按闸门流程停下，已拒绝' },
        { status: 500 },
      );
    }
    return Response.json({
      pendingActionId: result.output.pendingActionId,
      harm: result.output.harm,
    });
  } catch (error) {
    // 服务端拒绝原文透传（缺 projectId / 项目不存在）——前端原样展示，不改写
    const message =
      error instanceof Error ? error.message : '分享发起失败，请重试';
    return Response.json({ error: message }, { status: 400 });
  }
}
