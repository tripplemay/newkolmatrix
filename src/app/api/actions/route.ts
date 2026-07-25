// M4.5-AGENT-LOOP F007 — GET /api/actions：待确认动作清单（只读）
//
// 供 CopilotPanel 的「已备好 N 件待确认」聚合卡取数（今天页是 RSC 直读，不经此端点）。
// 与 GET /api/actions/[id] 同口径：只回 harm 披露与状态，**不含** inputJson / 任何 hash / 票据。
//
// 【边界】本端点是**只读**的。批量确认没有对应端点——聚合卡的「依次确认」是前端逐项调
// 既有 /api/actions/{id}/confirm + /execute（见 lib/gate/batch-confirm.ts 文件头）。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

import { buildToolContext } from 'lib/agent/context';
import { actionsRateLimitGuard, gateErrorResponse } from 'lib/agent/gate/http';
import { aggregatePending } from 'lib/agent/orchestrator';
import { toPendingBatchItems } from 'lib/gate/pending-items';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const limited = actionsRateLimitGuard(req);
  if (limited) return limited;
  try {
    const ctx = await buildToolContext();
    const pending = await aggregatePending(ctx);
    return Response.json({ items: toPendingBatchItems(pending) });
  } catch (error) {
    return gateErrorResponse(error);
  }
}
