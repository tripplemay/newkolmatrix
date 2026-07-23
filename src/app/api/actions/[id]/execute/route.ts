// M3-A-REACH-CRM F002 — POST /api/actions/[id]/execute { ticket }：消费执行票并执行（§9.3.2）
//
// 原子条件 UPDATE（WHERE status='confirmed' AND ticketUsedAt IS NULL AND ticketExpiresAt>now()）
// 消并发双消费 / 票重放（R15），败者 409。副作用成功 → 同一事务 executed + irrev + 业务态变更；
// 失败 → failed、无 irrev 行。运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { buildToolContext } from 'lib/agent/context';
import { executePendingAction } from 'lib/agent/gate/gate';
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
    const body = (await req.json().catch((): null => null)) as {
      ticket?: unknown;
    } | null;
    const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
    if (!ticket) {
      return Response.json(
        { code: 'GATE_TOKEN_INVALID', error: '缺少执行票 ticket' },
        { status: 403 },
      );
    }
    const ctx = await buildToolContext();
    const result = await executePendingAction(id, ticket, ctx);
    return Response.json(result);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
