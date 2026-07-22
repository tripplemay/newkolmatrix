// M2-A-MATCH F008 — 侧栏徽标计数服务（U4，消解 D-B 两批悬置）。
//
// 真源口径：
// - today   = PendingAction(status=pending) 计数——「今天雷达」的待办信号（非装饰）
// - projects = Project 计数
// 洞察徽标退役：无真源不显假数（D2）；恢复归 M4 洞察接真。
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
