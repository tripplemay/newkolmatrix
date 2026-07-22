// M2-A-MATCH F008 — GET /api/nav-badges：侧栏徽标真计数。
//
// { today: PendingAction(status=pending) 计数, projects: Project 计数 }。
// 失败 → 5xx；客户端（sidebar）按 D2 徽标全隐藏不抛错。
// 运行时 = nodejs（Prisma）。

import { getDevTenantId } from 'lib/agent/context';
import { getNavBadgeCounts } from 'lib/nav/badge-counts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const tenantId = await getDevTenantId();
    const counts = await getNavBadgeCounts(tenantId);
    return Response.json(counts);
  } catch (error) {
    console.error('[api/nav-badges] 失败:', error);
    return Response.json({ error: '徽标计数不可用' }, { status: 500 });
  }
}
