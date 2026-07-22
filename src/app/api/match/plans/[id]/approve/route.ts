// M2-A-MATCH F004 — POST /api/match/plans/{id}/approve：批准组合方案。
//
// internal 动作（FR-7.19/D27/D16 + :1352 双边铁律）：不产生 PendingAction、无确认
// 弹窗——路由是 approve-plan 服务的薄封装，批准语义（单选事务 + S10 推进）全在服务层。
// 运行时 = nodejs（Prisma）。

import { getDevTenantId } from 'lib/agent/context';
import { approvePlan } from 'lib/match/approve-plan';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const tenantId = await getDevTenantId();

    const result = await approvePlan(id, { tenantId });

    if (result.ok === false) {
      if (result.code === 'NOT_FOUND') {
        return Response.json({ error: '组合方案不存在' }, { status: 404 });
      }
      // PLAN_SUPERSEDED：过时方案（已被新一轮组合取代）
      return Response.json(
        { error: '该组合已被新方案取代，请刷新后批准现行组合' },
        { status: 409 },
      );
    }

    return Response.json({
      approved: true,
      already: result.already,
      planId: result.planId,
      planName: result.planName,
      projectId: result.projectId,
      // S10 推进结果注明（advance 失败不回滚批准）：
      // ok=false 时 reason 供前端决定是否提示（如已在 reach 属正常幂等场景）
      advance: result.advance
        ? { ok: result.advance.ok, reason: result.advance.reason, cur: result.advance.cur }
        : null,
    });
  } catch (error) {
    console.error('[api/match/approve] 失败:', error);
    return Response.json({ error: '批准失败，请重试' }, { status: 500 });
  }
}
