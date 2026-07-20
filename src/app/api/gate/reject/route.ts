// AGENT-FOUNDATION F009 — POST /api/gate/reject：操盘手拒绝 outbound 动作（失效 + block 留痕）
import { buildToolContext } from 'lib/agent/context';
import { rejectPendingAction } from 'lib/agent/gate/gate';
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
    const result = await rejectPendingAction(pendingActionId, ctx);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: describeGatewayError(error) }, { status: 409 });
  }
}
