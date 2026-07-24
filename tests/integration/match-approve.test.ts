// M2-A-MATCH F004 — 批准动线 + →reach 守卫解锁集成测试（打真库，D20 变异测试义务）。
//
// 变异断言设计：
// 1. 批准事务原子 + 单选语义：目标 approved、其余 draft → superseded 同事务
//    （杀「漏 supersede / 半事务」变异）；
// 2. S10 首个生产消费：批准后 advanceStage 真推进 cur match → reach + OperationLog 留痕
//    （杀「守卫未解锁 / advance 未接线」变异）；
// 3. 未批准拒：无 approved 组合时 canAdvance 拒 MATCH_PLAN_NOT_APPROVED
//    （杀「守卫恒放行」变异——假守卫 PRD :129 反模式）；
// 4. 重复批准幂等：already=true、approvedAt 不改写、不重复推进（杀「重放重写」变异）；
// 5. superseded 不可批准：拒 PLAN_SUPERSEDED 且全项目 approved 恒 ≤1（杀「多选」变异）；
// 6. advance 失败不回滚批准：非 match 位项目批准成功但推进被拒，批准仍生效
//    （杀「advance 失败连带回滚」变异）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { approvePlan } from '../../src/lib/match/approve-plan';
import { advanceStage } from '../../src/lib/domain/env-advance';

const FIXTURE_SLUG = `test-tenant-m2a-approve-${process.pid}`;

const GOAL = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
};

const EMPTY_METRICS = {
  reachTotal: null,
  budgetUsd: null,
  risk: null,
  people: 0,
} as unknown as Prisma.InputJsonValue;

let tenantId: string;
let projectId: string;
let planA: string;
let planB: string;
let planC: string;

async function makeDraftPlan(pid: string, name: string): Promise<string> {
  const p = await prisma.matchPlan.create({
    data: {
      tenantId,
      projectId: pid,
      name,
      metrics: EMPTY_METRICS,
      rationale: '夹具组合',
      status: 'draft',
    },
  });
  return p.id;
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2A approve 集成测试夹具租户' },
  });
  tenantId = t.id;

  const project = await prisma.project.create({
    data: {
      tenantId,
      name: 'M2A F004 夹具项目',
      goal: GOAL,
      cur: 'match',
      maxReached: 'match',
    },
  });
  projectId = project.id;

  planA = await makeDraftPlan(projectId, 'A · 生活流精投组');
  planB = await makeDraftPlan(projectId, 'B · 均衡组');
  planC = await makeDraftPlan(projectId, 'C · 头部拉动组');
});

afterAll(async () => {
  // 夹具租户 Cascade 整体清零（D-H：Match 表产物测毕复原）
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('未批准拒（变异断言 3）', () => {
  it('无 approved 组合时 advanceStage 拒 MATCH_PLAN_NOT_APPROVED，游标不动、零留痕', async () => {
    const logsBefore = await prisma.operationLog.count({ where: { tenantId } });
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MATCH_PLAN_NOT_APPROVED');
    expect(r.cur).toBe('match');

    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.cur).toBe('match');
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(logsBefore);
  });
});

describe('批准动线（变异断言 1/2）', () => {
  it('批准 B：事务原子（B approved + A/C superseded）+ S10 真推进 match → reach + 留痕', async () => {
    const r = await approvePlan(planB, { tenantId });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.already).toBe(false);

    // 单选语义：同项目其余 draft 全部出局
    const b = await prisma.matchPlan.findUniqueOrThrow({ where: { id: planB } });
    expect(b.status).toBe('approved');
    expect(b.approvedBy).toBe('operator');
    expect(b.approvedAt).not.toBeNull();
    for (const id of [planA, planC]) {
      const p = await prisma.matchPlan.findUniqueOrThrow({ where: { id } });
      expect(p.status).toBe('superseded');
    }

    // S10：advanceStage 首个生产消费点——守卫经 hasApprovedMatchPlan 放行并落库
    expect(r.advance?.ok).toBe(true);
    expect(r.advance?.cur).toBe('reach');
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.cur).toBe('reach');
    expect(row.maxReached).toBe('reach');

    // 推进留痕（advanceStage 事务内写 OperationLog）
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, kind: 'auto' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  });

  it('全项目 approved 恒 ≤1（变异断言 5 的守恒面）', async () => {
    const approved = await prisma.matchPlan.count({
      where: { projectId, status: 'approved' },
    });
    expect(approved).toBe(1);
  });
});

describe('重复批准幂等（变异断言 4）', () => {
  it('已 approved 的 plan 重放：already=true、approvedAt 不改写、不重复推进', async () => {
    const before = await prisma.matchPlan.findUniqueOrThrow({ where: { id: planB } });
    const logsBefore = await prisma.operationLog.count({ where: { tenantId } });

    const r = await approvePlan(planB, { tenantId });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.already).toBe(true);
    expect(r.advance).toBeNull();

    const after = await prisma.matchPlan.findUniqueOrThrow({ where: { id: planB } });
    expect(after.approvedAt?.getTime()).toBe(before.approvedAt?.getTime());
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(logsBefore);
  });
});

describe('superseded 不可批准（变异断言 5）', () => {
  it('对已 superseded 的 plan 批准 → PLAN_SUPERSEDED 拒，approved 计数不变', async () => {
    const r = await approvePlan(planA, { tenantId });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe('PLAN_SUPERSEDED');

    const approved = await prisma.matchPlan.count({
      where: { projectId, status: 'approved' },
    });
    expect(approved).toBe(1);
  });

  it('不存在的 plan → NOT_FOUND', async () => {
    const r = await approvePlan('nonexistent-id', { tenantId });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe('NOT_FOUND');
  });
});

describe('advance 失败不回滚批准（变异断言 6）', () => {
  it('已在 reach 的项目批准新 draft：批准生效、推进被拒（NO_DEAL_YET）、互不回滚', async () => {
    // 项目已推进到 reach（前面用例的产物）；重跑组合会产生新 draft——模拟夜间刷新后再批准
    const newDraft = await makeDraftPlan(projectId, 'B · 均衡组（新一轮）');
    const r = await approvePlan(newDraft, { tenantId });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.already).toBe(false);

    // 批准生效（注意：此时旧 approved 仍在——approvePlan 只 supersede draft，
    // 不动历史 approved；「现行组合」语义由读取方取最新 approvedAt）
    const p = await prisma.matchPlan.findUniqueOrThrow({ where: { id: newDraft } });
    expect(p.status).toBe('approved');

    // 推进被拒：reach→delivery 依赖 ≥1 Deal（M3-B F010 真判定），失败注明但不回滚批准
    expect(r.advance?.ok).toBe(false);
    expect(r.advance?.reason).toBe('NO_DEAL_YET');
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.cur).toBe('reach');
  });
});
