// M3-A-REACH-CRM F002 — POST /api/actions/[id]/confirm：确认 = 签发一次性执行票（§9.3.2）
//
// 只有人（操盘手）经此端点确认。执行票明文**仅在本响应出现一次**（DB 只存 hash）；
// 副作用不在此发生——须凭票再调 POST /api/actions/[id]/execute 消费。
// 原子条件 UPDATE（WHERE status='pending'）消并发双确认（R15），败者 409。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { buildToolContext } from 'lib/agent/context';
import { confirmPendingAction } from 'lib/agent/gate/gate';
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
    const result = await confirmPendingAction(id, ctx);
    return Response.json(result);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
