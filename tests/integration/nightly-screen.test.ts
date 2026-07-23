// M2-A-MATCH F006 — nightly-screen 例程 + scheduler 注册表化集成测试（打真库 + mock 向量 P7）。
//
// 断言设计：
// 1. 注册表两例程：ROUTINES 含 health-scan + nightly-screen（cron 常量逐字，:1815 消解证据）；
// 2. 例程闭环：cur='match' 项目刷出候选 + 3 组 draft + OperationLog(actor='match') 留痕；
// 3. 幂等：二跑候选数不增、旧 draft → superseded 新 3 组（P4 服务层语义经例程路径复核）；
// 4. approved 不动：重跑例程后 approved 行原样（P4 变异断言的例程面）；
// 5. 失败逐项目消化：网关抛错的项目 failed 计数、不中断整轮、无留痕、不外抛；
// 6. 范围圈定：cur≠match 的项目不进筛查。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import {
  ROUTINES,
  HEALTH_SCAN_CRON,
  NIGHTLY_SCREEN_CRON,
} from '../../src/lib/jobs/scheduler';
import { runNightlyScreen } from '../../src/lib/jobs/routines/nightly-screen';

const FIXTURE_SLUG = `test-tenant-m2a-nightly-${process.pid}`;
const DIMS = 1024;

function unitVec(first: number, second: number): number[] {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = first;
  v[1] = second;
  return v;
}

const mockEmbed = async (): Promise<number[]> => unitVec(1, 0);

let tenantId: string;
let projectMatch: string; // cur='match'，进筛查
let projectBrief: string; // cur='brief'，不进筛查

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2A nightly 集成测试夹具租户' },
  });
  tenantId = t.id;

  const pm = await prisma.project.create({
    data: {
      tenantId,
      name: 'M2A F006 夹具项目（match）',
      cur: 'match',
      maxReached: 'match',
      goal: {
        targetExposure: 500_000,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
      },
    },
  });
  projectMatch = pm.id;

  const pb = await prisma.project.create({
    data: {
      tenantId,
      name: 'M2A F006 夹具项目（brief）',
      cur: 'brief',
      maxReached: 'brief',
    },
  });
  projectBrief = pb.id;

  // 两个带 embedding 的夹具 KOL（余弦 1.0 / 0.8）
  for (const [handle, vec, followers] of [
    ['n1', unitVec(1, 0), 40_000],
    ['n2', unitVec(0.8, 0.6), 300_000],
  ] as const) {
    const k = await prisma.kol.create({
      data: {
        tenantId,
        canonicalHandle: `m2a-f006-${handle}`,
        displayName: `夹具 ${handle}`,
        platform: 'youtube',
        followers,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
      `[${vec.join(',')}]`,
      k.id,
    );
  }
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('scheduler 注册表化（:1815 口径消解）', () => {
  // M2-B F003 翻牌：注册表随批次增长（kol-sync 登记）——「登记即调度」正是注册表化的口径。
  // health-scan / nightly-screen 两条 M2-A 断言语义零变更（名称/顺序/cron 逐字保持）。
  it('ROUTINES 含 health-scan @ 0 2 与 nightly-screen @ 30 2（错峰；M2-B 起第三例程 kol-sync 由其套件覆盖）', () => {
    expect(ROUTINES.map((r) => r.name).slice(0, 2)).toEqual([
      'health-scan',
      'nightly-screen',
    ]);
    expect(ROUTINES[0].cron).toBe(HEALTH_SCAN_CRON);
    expect(ROUTINES[1].cron).toBe(NIGHTLY_SCREEN_CRON);
    expect(HEALTH_SCAN_CRON).toBe('0 2 * * *'); // health-scan 行为零变更
    expect(NIGHTLY_SCREEN_CRON).toBe('30 2 * * *');
    for (const r of ROUTINES) expect(typeof r.run).toBe('function');
  });
});

describe('runNightlyScreen 闭环', () => {
  it('cur=match 项目刷出候选 + 3 组 draft + actor=match 留痕；cur≠match 不进筛查', async () => {
    const r = await runNightlyScreen(tenantId, { embed: mockEmbed });
    expect(r).toEqual({ projects: 1, succeeded: 1, failed: 0 });

    expect(
      await prisma.matchCandidate.count({ where: { projectId: projectMatch } }),
    ).toBe(2);
    expect(
      await prisma.matchPlan.count({
        where: { projectId: projectMatch, status: 'draft' },
      }),
    ).toBe(3);
    // 范围圈定：brief 项目零产物
    expect(
      await prisma.matchCandidate.count({ where: { projectId: projectBrief } }),
    ).toBe(0);

    const log = await prisma.operationLog.findFirst({
      where: {
        tenantId,
        projectId: projectMatch,
        actor: 'match',
        kind: 'auto',
      },
    });
    expect(log).not.toBeNull();
    expect(log?.payloadJson).toMatchObject({
      routine: 'nightly-screen',
      candidates: 2,
      plans: 3,
    });
  });

  it('幂等重跑：候选数不增、旧 draft → superseded、新 3 组 draft', async () => {
    const r = await runNightlyScreen(tenantId, { embed: mockEmbed });
    expect(r.succeeded).toBe(1);

    expect(
      await prisma.matchCandidate.count({ where: { projectId: projectMatch } }),
    ).toBe(2);
    expect(
      await prisma.matchPlan.count({
        where: { projectId: projectMatch, status: 'draft' },
      }),
    ).toBe(3);
    expect(
      await prisma.matchPlan.count({
        where: { projectId: projectMatch, status: 'superseded' },
      }),
    ).toBe(3);
  });

  it('approved 不动（P4 例程面）：重跑后 approved 行原样，新一轮照常生成', async () => {
    const target = await prisma.matchPlan.findFirstOrThrow({
      where: { projectId: projectMatch, status: 'draft' },
    });
    await prisma.matchPlan.update({
      where: { id: target.id },
      data: {
        status: 'approved',
        approvedBy: 'operator',
        approvedAt: new Date(),
      },
    });

    const r = await runNightlyScreen(tenantId, { embed: mockEmbed });
    expect(r.succeeded).toBe(1);

    const still = await prisma.matchPlan.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(still.status).toBe('approved');
    expect(
      await prisma.matchPlan.count({
        where: { projectId: projectMatch, status: 'draft' },
      }),
    ).toBe(3);
  });

  it('失败逐项目消化：网关抛错 → failed 计数、不外抛、无留痕', async () => {
    const logsBefore = await prisma.operationLog.count({ where: { tenantId } });
    const boom = async (): Promise<number[]> => {
      throw new Error('gateway unreachable (fixture)');
    };
    const r = await runNightlyScreen(tenantId, { embed: boom });
    expect(r).toEqual({ projects: 1, succeeded: 0, failed: 1 });
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(
      logsBefore,
    );
  });
});
