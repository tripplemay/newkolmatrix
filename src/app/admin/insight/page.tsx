// M4-INSIGHT F010 — 洞察页路由（RSC 薄壳）：跨项目真数据组装 → InsightPageView。
//
// RSC 直读 DB → 必须 force-dynamic（web-runtime-patterns §6：无 dynamic API 的页面
// 默认构建期静态预渲染——有库则数据冻结成快照、无库则 build 硬红；M1-C F001 同坑先例）。
// 数据装配与降级语义在 lib/insight/cross-surface-data.ts（失败静默降级空态，CI 安全）。

import InsightPageView from 'components/insight/InsightPageView';
import { loadCrossInsightData } from 'lib/insight/cross-surface-data';
import { requireSessionTenantId } from 'lib/auth/session-tenant';

export const dynamic = 'force-dynamic';

export default async function InsightPage() {
  // M5-AUTH-RLS F004（spec D-3）：租户来自登录会话，在 loader 的降级 try 之外解析——
  // 未登录必须是错误（middleware 已拦成 302），不能降级成一张空白页。
  const tenantId = await requireSessionTenantId();
  const data = await loadCrossInsightData({ tenantId });
  return <InsightPageView data={data} />;
}
