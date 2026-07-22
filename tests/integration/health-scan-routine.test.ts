// M1-C F004 — health-scan 例程集成测试（打真库）。
//
// 要验的是「例程真的往 OperationLog 落 kind=auto 留痕 + payload 形状 + 幂等重跑」
// 与互斥锁行为——留痕落库只有真库能证。夹具自建自清（env-advance 范式）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { runHealthScan } from '../../src/lib/jobs/routines/health-scan';
import { runExclusive } from '../../src/lib/jobs/scheduler';

const FIXTURE_SLUG = `test-tenant-health-scan-${process.pid}`;
const NOW = new Date('2026-07-22T02:00:00Z');

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'health-scan 集成测试夹具' },
    select: { id: true },
  });
  tenantId = tenant.id;
  await prisma.project.createMany({
    data: [
      {
        tenantId,
        name: '巡检项目甲',
        goal: {
          targetExposure: 1_000_000,
          periodStart: '2026-07-01',
          periodEnd: '2026-07-31',
        },
        budgetTotal: 10_000,
        currency: 'USD',
      },
      // goal 缺失的脏数据项目：巡检不得抛错（D2）
      { tenantId, name: '巡检项目乙' },
    ],
  });
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('health-scan 例程（M1-C F004，D-C）', () => {
  it('每项目落一条 OperationLog(kind=auto, actor=strategy) + payload 形状', async () => {
    const r = await runHealthScan(tenantId, NOW);
    expect(r).toEqual({ scanned: 2, logged: 2 });

    const logs = await prisma.operationLog.findMany({
      where: { tenantId, kind: 'auto' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.length).toBe(2);
    for (const log of logs) {
      expect(log.actor).toBe('strategy');
      expect(log.projectId).not.toBeNull();
      expect(log.summary).toContain('例程巡检');
      const payload = log.payloadJson as {
        routine: string;
        score: number;
        band: string;
      };
      expect(payload.routine).toBe('health-scan');
      expect(payload.score).toBeGreaterThanOrEqual(0);
      expect(payload.score).toBeLessThanOrEqual(100);
      expect(['gd', 'wn', 'cr']).toContain(payload.band);
    }
  });

  it('幂等重跑不炸——留痕 append-only 快照，每轮各留一组（设计而非缺陷）', async () => {
    const r = await runHealthScan(tenantId, NOW);
    expect(r.logged).toBe(2);
    const count = await prisma.operationLog.count({
      where: { tenantId, kind: 'auto' },
    });
    expect(count).toBe(4); // 两轮 × 2 项目
  });

  it('互斥锁：同名例程并发时后到方跳过（返回 null），锁在完成后释放', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    const first = runExclusive('mutex-probe', async () => {
      await blocked;
      return 'first';
    });
    const second = await runExclusive('mutex-probe', async () => 'second');
    expect(second).toBeNull(); // 互斥：跳过不重入
    release();
    expect(await first).toBe('first');
    // 锁已释放：再次可进
    expect(await runExclusive('mutex-probe', async () => 'third')).toBe(
      'third',
    );
  });
});
