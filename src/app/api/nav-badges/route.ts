// M2-A-MATCH F008 — GET /api/nav-badges：侧栏徽标真计数。
//
// { today: PendingAction(status=pending) 计数, projects: Project 计数 }。
// 失败 → 5xx；客户端（sidebar）按 D2 徽标全隐藏不抛错。
// 运行时 = nodejs（Prisma）。

// M5.1b-TENANT-INJECTION F005（spec D-6 最小闭环）— 本路由是 **route handler 执行上下文**
// 的 ALS 传播样板：会话租户在此建立 withTenant 作用域，getNavBadgeCounts 里的两条
// count 因此落在同一个事务上（RLS 认的 app.tenant_id 已 SET LOCAL 进去）。
// 传播的行为级证据 → tests/integration/als-context-propagation.test.ts。
import { withSessionTenant } from 'lib/db/tenant-entry';
import { getNavBadgeCounts } from 'lib/nav/badge-counts';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const counts = await withSessionTenant(({ tenantId }) =>
      getNavBadgeCounts(tenantId),
    );
    return Response.json(counts);
  } catch (error) {
    console.error('[api/nav-badges] 失败:', error);
    return Response.json({ error: '徽标计数不可用' }, { status: 500 });
  }
}
