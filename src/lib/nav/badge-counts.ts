// M2-A-MATCH F008 — 侧栏徽标计数服务（U4，消解 D-B 两批悬置）。
//
// 真源口径：
// - today   = PendingAction(status=pending) 计数——「今天雷达」的待办信号（非装饰）
// - projects = Project 计数
// 洞察徽标退役：无真源不显假数（D2）。M4 批末复核：洞察域已接真（未采纳周报数等
// 可作徽标源），恢复不在 M4 features 范围——口径与恢复与否留下批产品裁决。
// tenantId 维度轻量查询（两条 count，索引命中）。

import { prisma } from 'lib/db/prisma';

export interface NavBadgeCounts {
  today: number;
  projects: number;
}

export async function getNavBadgeCounts(
  tenantId: string,
): Promise<NavBadgeCounts> {
  const [today, projects] = await Promise.all([
    prisma.pendingAction.count({ where: { tenantId, status: 'pending' } }),
    prisma.project.count({ where: { tenantId } }),
  ]);
  return { today, projects };
}
