// M4-INSIGHT F011 — weekly-draft 例程集成测试
//
// 覆盖 acceptance：
// - 注册进 scheduler 注册表（ROUTINES 含 weekly-draft + 周一 04:00 错峰 cron）
// - 执行 = 汇总跨项目度量 → draft_report 服务起草 → WeeklyReport(projectId=null, adopted=false) 落库
// - 幂等/可重入：同周期重跑不重复建（服务层覆盖策略）+ runExclusive 互斥
// - 无网关凭据降级固定草案明示（CI 无凭据即走此分支；本测试显式清凭据保证零外呼）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  ROUTINES,
  WEEKLY_DRAFT_CRON,
  runExclusive,
} from '../../src/lib/jobs/scheduler';
import { runWeeklyDraft } from '../../src/lib/jobs/routines/weekly-draft';

const FIXTURE_SLUG = `test-tenant-m4-weekly-${process.pid}`;

let tenantId: string;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  // 零外呼保证：清凭据 → 服务层降级固定草案（真网关 L2 留验收授权）
  for (const k of ['AIGCGATEWAY_BASE_URL', 'AIGCGATEWAY_API_KEY']) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 weekly-draft 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: '周报夹具项目' },
  });
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `weekly-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: p.id,
      kolId: kol.id,
      termsJson: { amount: 300 } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'WeeklyKol',
            amount: 300,
            currency: 'USD',
            basis: '夹具依据',
            status: 'released',
          },
        ],
      },
    },
  });
});

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v != null) process.env[k] = v;
  }
  await prisma.weeklyReport.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册表', () => {
  it('weekly-draft 已登记进 ROUTINES（沿 run-nightly-screen/run-health-scan 先例）', () => {
    const def = ROUTINES.find((r) => r.name === 'weekly-draft');
    expect(def).toBeTruthy();
    expect(def?.cron).toBe(WEEKLY_DRAFT_CRON);
    expect(WEEKLY_DRAFT_CRON).toBe('0 4 * * 1'); // 周一 04:00，与夜间例程错峰
  });
});

describe('执行体', () => {
  it('跨项目起草 → WeeklyReport(projectId=null, adopted=false) 落库；无凭据降级明示', async () => {
    const r = await runWeeklyDraft(tenantId);
    expect(r.degraded).toBe(true); // 本测试清了凭据——固定草案分支（零外呼）
    expect(r.skippedAdopted).toBe(false);

    const row = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r.reportId },
    });
    expect(row.projectId).toBeNull(); // 跨项目周报（P10）
    expect(row.adopted).toBe(false);
    expect(row.period).toBe(r.period);
    expect(row.generatedBy).toBe('insight');
    expect(row.draftContent.startsWith('【降级草案】')).toBe(true); // 明示不静默
    expect(row.draftContent).toContain('周报夹具项目'); // 汇总跨项目度量（真实事实）
  });

  it('幂等/可重入：同周期重跑覆盖同一行，不堆重复', async () => {
    const first = await runWeeklyDraft(tenantId);
    const second = await runWeeklyDraft(tenantId);
    expect(second.reportId).toBe(first.reportId);
    const count = await prisma.weeklyReport.count({
      where: { tenantId, projectId: null, period: first.period },
    });
    expect(count).toBe(1);
  });

  it('runExclusive 互斥：上一轮未结束时本轮跳过（返回 null）', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((res) => {
      release = res;
    });
    const held = runExclusive('weekly-draft', async () => {
      await blocker;
      return 'done';
    });
    const skipped = await runExclusive('weekly-draft', async () => 'second');
    expect(skipped).toBeNull();
    release();
    expect(await held).toBe('done');
  });
});
