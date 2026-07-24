// M4-INSIGHT F010 — 洞察页路由（RSC 薄壳）：跨项目真数据组装 → InsightPageView。
//
// RSC 直读 DB → 必须 force-dynamic（web-runtime-patterns §6：无 dynamic API 的页面
// 默认构建期静态预渲染——有库则数据冻结成快照、无库则 build 硬红；M1-C F001 同坑先例）。
// 数据装配与降级语义在 lib/insight/cross-surface-data.ts（失败静默降级空态，CI 安全）。

import InsightPageView from 'components/insight/InsightPageView';
import { loadCrossInsightData } from 'lib/insight/cross-surface-data';

export const dynamic = 'force-dynamic';

export default async function InsightPage() {
  const data = await loadCrossInsightData();
  return <InsightPageView data={data} />;
}
