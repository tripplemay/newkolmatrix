// M3-A-REACH-CRM F002 — POST /api/actions/[id]/reject：拒绝（§9.3.2）
//
// 写真实 rejected 态（清 v0「expiresAt=epoch 失效」债）+ block 留痕。备好物保留；
// Agent 重试须产出**新的** PendingAction（新一轮披露、新的确认）——不可逆动作严禁静默重试。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { buildToolContext } from 'lib/agent/context';
import { rejectPendingAction } from 'lib/agent/gate/gate';
import { actionsRateLimitGuard, gateErrorResponse } from 'lib/agent/gate/http';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = actionsRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const ctx = await buildToolContext();
    const result = await rejectPendingAction(id, ctx);
    return Response.json(result);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
