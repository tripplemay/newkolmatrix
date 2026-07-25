// M4.5-AGENT-LOOP F007 — 聚合确认卡的 client island（RSC 页面用）
//
// RSC 不能把回调函数传过 client 边界，故用这层薄壳接 router.refresh()：
// 批量确认后页面数据（雷达 / KPI / feed）随库刷新。

'use client';

import { useRouter } from 'next/navigation';
import PendingBatchCard from './PendingBatchCard';
import type { PendingBatchItem } from 'lib/gate/pending-items';

export default function PendingBatchIsland({
  items,
}: {
  items: PendingBatchItem[];
}) {
  const router = useRouter();
  return <PendingBatchCard items={items} onDone={() => router.refresh()} />;
}
