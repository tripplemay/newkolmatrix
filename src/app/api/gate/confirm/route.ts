// AGENT-FOUNDATION F009 — POST /api/gate/confirm：操盘手确认待执行的 outbound 动作
//
// 只有人（操盘手）通过此端点确认 → 服务端签发令牌 → 执行 → 同事务写 irrev 留痕。
// 模型自主 loop 不经此端点（它只拿到 pending 信封），故无法自我放行。运行时 = nodejs（Prisma）。

import { buildToolContext } from 'lib/agent/context';
import { confirmPendingAction } from 'lib/agent/gate/gate';
import { describeGatewayError } from 'lib/ai/gateway';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { pendingActionId?: unknown };
    const pendingActionId = typeof body?.pendingActionId === 'string' ? body.pendingActionId : '';
    if (!pendingActionId) {
      return Response.json({ error: '缺少 pendingActionId' }, { status: 400 });
    }
    const ctx = await buildToolContext();
    const result = await confirmPendingAction(pendingActionId, ctx);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: describeGatewayError(error) }, { status: 409 });
  }
}
