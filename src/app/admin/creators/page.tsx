// M2-B-CREATORS F004 — 创作者库 RSC 数据层（原 'use client' 整页拆分：
// 数据组装在此（服务端直读 DB），交互层归 components/creators/CreatorsClient）。
// 筛选态 URL 化（裁决 #4）：RSC 读 searchParams → page-data 服务端过滤。

import { Suspense } from 'react';
import CreatorsClient from 'components/creators/CreatorsClient';
import { getDevTenantId } from 'lib/agent/context';
import { loadCreatorsPageData } from 'lib/creators/page-data';

// RSC 直读 DB 必须显式动态渲染（v1.0.9 §6：默认静态预渲染会把查询冻结进构建期快照，
// 或在无 DB 的 CI Build job 直接硬红）。本页读 searchParams 天然动态，仍显式声明兜底。
export const dynamic = 'force-dynamic';

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; category?: string }>;
}) {
  const { platform, category } = await searchParams;
  const tenantId = await getDevTenantId();
  const data = await loadCreatorsPageData(tenantId, { platform, category });

  return (
    // useSearchParams（client 层）须 Suspense 包裹（Next 15，沿 CopilotPanel 先例）
    <Suspense
      fallback={
        <div className="mt-3 p-4 text-sm text-gray-400">加载创作者库…</div>
      }
    >
      <CreatorsClient data={data} />
    </Suspense>
  );
}
