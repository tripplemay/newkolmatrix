// M2-A-MATCH F008 — 侧栏徽标计数服务集成测试（打真库，夹具租户隔离）。
//
// 断言：today = PendingAction(status=pending) 计数（confirmed/executed 不计）；
// projects = Project 计数；租户维度隔离（他租户数据不串）。
// fetch 失败 → 徽标隐藏属客户端行为（sidebar D2 分支），由视觉/E2E 层覆盖，
// 本文件盯服务端计数口径。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNavBadgeCounts } from '../../src/lib/nav/badge-counts';

const FIXTURE_SLUG = `test-tenant-m2a-badges-${process.pid}`;

let tenantId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2A badges 集成测试夹具租户' },
  });
  tenantId = t.id;

  await prisma.project.createMany({
    data: [
      { tenantId, name: '徽标夹具项目 1' },
      { tenantId, name: '徽标夹具项目 2' },
    ],
  });
  await prisma.pendingAction.createMany({
    data: [
      // 3 条 pending 计入 today
      ...[1, 2, 3].map((i) => ({
        tenantId,
        kind: 'outbound',
        toolName: 'send_outreach',
        payloadHash: `m2a-badges-${i}`,
        harmJson: { action: 'fixture' },
        status: 'pending' as const,
      })),
      // 非 pending 不计入
      {
        tenantId,
        kind: 'outbound',
        toolName: 'send_outreach',
        payloadHash: 'm2a-badges-executed',
        harmJson: { action: 'fixture' },
        status: 'executed' as const,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('getNavBadgeCounts（F008 真计数口径）', () => {
  it('today = pending 计数（executed 不计）；projects = Project 计数', async () => {
    const counts = await getNavBadgeCounts(tenantId);
    expect(counts).toEqual({ today: 3, projects: 2 });
  });

  it('租户隔离：空租户全 0（客户端按 0 → 徽标隐藏）', async () => {
    const empty = await prisma.tenant.create({
      data: { slug: `${FIXTURE_SLUG}-empty`, name: '空租户' },
    });
    const counts = await getNavBadgeCounts(empty.id);
    expect(counts).toEqual({ today: 0, projects: 0 });
    await prisma.tenant.delete({ where: { id: empty.id } });
  });
});
