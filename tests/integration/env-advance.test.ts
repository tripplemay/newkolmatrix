// M1-A-BRIEF F006 — 环节推进的集成测试（打真库，非 mock）。
//
// 为什么必须是集成测试而非单测：本 feature 的实质断言是「推进与留痕在同一事务里成对发生」
// 与「被拒时一条都不写」。mock 掉 prisma 就等于把要验的东西替换成自己的假设——
// 事务语义、枚举取值、jsonb 往返，只有真库能验。
//
// 夹具自建自清：不依赖 seed，避免与 npm run seed:projects 的数据互相污染。

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { advanceStage } from '../../src/lib/domain/env-advance';
import type { ProjectGoal } from '../../src/lib/data/schemas/project';

const GOAL: ProjectGoal = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

const FIXTURE_SLUG = `test-tenant-env-advance-${process.pid}`;

let tenantId: string;
let projectId: string;

async function countLogs(): Promise<number> {
  return prisma.operationLog.count({ where: { tenantId } });
}

/** 把夹具项目重置到指定状态。直接写库——测试要造的是【前置状态】，不走产品推进路径。 */
async function resetProject(
  cur: 'brief' | 'match' | 'reach' | 'delivery' | 'insight',
  maxReached: 'brief' | 'match' | 'reach' | 'delivery' | 'insight',
  goal: ProjectGoal | null = GOAL,
): Promise<void> {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.update({
    where: { id: projectId },
    data: { cur, maxReached, goal: goal ?? undefined },
  });
  if (goal === null) {
    await prisma.project.update({
      where: { id: projectId },
      data: { goal: { set: null } },
    });
  }
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'env-advance 集成测试夹具' },
    select: { id: true },
  });
  tenantId = tenant.id;
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: '集成测试项目',
      cur: 'brief',
      maxReached: 'brief',
      goal: GOAL,
    },
    select: { id: true },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  // Project 经 tenant 级联删除
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetProject('brief', 'brief', GOAL);
});

describe('推进成功 → 恰好写一条 OperationLog', () => {
  it('brief→match 成功，游标与 maxReached 同步前进', async () => {
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.cur).toBe('match');
    expect(r.maxReached).toBe('match');

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { cur: true, maxReached: true },
    });
    expect(row.cur).toBe('match');
    expect(row.maxReached).toBe('match');
  });

  it('恰好写一条日志，且取值符合 D10 + D13', async () => {
    const r = await advanceStage({ projectId, tenantId });
    expect(await countLogs()).toBe(1);

    const log = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r.logId! },
    });
    // kind 取现有枚举中语义最近者，不扩枚举（architecture.md:800 的 auto = 可逆动作）
    expect(log.kind).toBe('auto');
    // projectId 落 D13 新增列
    expect(log.projectId).toBe(projectId);
    // 载荷四字段齐全，落 payloadJson 而非 summary / ref
    expect(log.payloadJson).toEqual({
      from: 'brief',
      to: 'match',
      maxReachedBefore: 'brief',
      maxReachedAfter: 'match',
    });
    // ref 语义单一（专指 PendingAction.id），推进不得占用
    expect(log.ref).toBeNull();
    // summary 是展示契约，放人话即可，但不得为空
    expect(log.summary).toBeTruthy();
    expect(typeof log.summary).toBe('string');
  });

  it('actor 可指定，缺省为编排 Agent', async () => {
    const r1 = await advanceStage({ projectId, tenantId, actor: 'strategy' });
    const l1 = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r1.logId! },
    });
    expect(l1.actor).toBe('strategy');

    await resetProject('brief', 'brief', GOAL);
    const r2 = await advanceStage({ projectId, tenantId });
    const l2 = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r2.logId! },
    });
    expect(l2.actor).toBe('orchestrator');
  });
});

describe('守卫拒绝 → 零写入（失败尝试不得掺进北极星指标）', () => {
  it('goal 未确认时 brief→match 被拒，且一条日志都不写', async () => {
    await resetProject('brief', 'brief', null);
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('BRIEF_GOAL_NOT_CONFIRMED');
    expect(r.logId).toBeNull();
    expect(await countLogs()).toBe(0);
  });

  it('前置未满足的三条被拒，各自零写入且游标不动（M2-A F004：match→reach 翻真判定理由）', async () => {
    // match→reach 已于 M2-A F004 替换为真判定：夹具项目无 approved MatchPlan
    // → MATCH_PLAN_NOT_APPROVED（拒绝语义不变，理由翻牌）；其余两条仍为 D9 占位（M3）。
    const d9: Array<
      ['brief' | 'match' | 'reach' | 'delivery' | 'insight', string]
    > = [
      ['match', 'MATCH_PLAN_NOT_APPROVED'],
      ['reach', 'DEPENDENCY_NOT_IMPLEMENTED'],
      ['delivery', 'DEPENDENCY_NOT_IMPLEMENTED'],
    ];
    for (const [from, expectedReason] of d9) {
      await resetProject(from, from, GOAL);
      const r = await advanceStage({ projectId, tenantId });
      expect(r.ok, `cur=${from} 不得放行`).toBe(false);
      expect(r.reason).toBe(expectedReason);
      expect(await countLogs(), `cur=${from} 不得写日志`).toBe(0);

      const row = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { cur: true },
      });
      expect(row.cur, `cur=${from} 游标不得变动`).toBe(from);
    }
  });

  it('末环节推进被拒，零写入', async () => {
    await resetProject('insight', 'insight', GOAL);
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ALREADY_AT_FINAL_STAGE');
    expect(await countLogs()).toBe(0);
  });

  it('不变量被破坏时被拒，零写入', async () => {
    // 直接写库造出非法态（cur > maxReached），模拟外部污染
    await resetProject('brief', 'brief', GOAL);
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'insight', maxReached: 'brief' },
    });
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INVARIANT_VIOLATED');
    expect(await countLogs()).toBe(0);
  });

  it('项目不存在时被拒，零写入', async () => {
    const r = await advanceStage({ projectId: 'no-such-project', tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('PROJECT_NOT_FOUND');
    expect(await countLogs()).toBe(0);
  });

  it('跨租户不可推进（tenantId 不匹配即视为不存在）', async () => {
    const r = await advanceStage({ projectId, tenantId: 'other-tenant' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('PROJECT_NOT_FOUND');
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { cur: true },
    });
    expect(row.cur).toBe('brief');
  });
});

describe('maxReached 抬升幂等 / 单调不减（D2）', () => {
  it('cur 回退后再推进，maxReached 不回落也不重复抬升', async () => {
    // 先推进到 match，maxReached=match
    await advanceStage({ projectId, tenantId });
    let row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { cur: true, maxReached: true },
    });
    expect(row).toEqual({ cur: 'match', maxReached: 'match' });

    // 回退 cur 到 brief（maxReached 保持 match —— 这正是 D2 双值的用途）
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'brief' },
    });

    // 再推进一次：cur 回到 match，maxReached 仍是 match（不回落、不多跳）
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('match');
    expect(r.maxReached).toBe('match');

    row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { cur: true, maxReached: true },
    });
    expect(row).toEqual({ cur: 'match', maxReached: 'match' });
  });

  it('重复推进产生的日志载荷如实反映 maxReached 未变', async () => {
    await advanceStage({ projectId, tenantId });
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'brief' },
    });
    const r = await advanceStage({ projectId, tenantId });

    const log = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r.logId! },
    });
    // 第二次推进：maxReached 前后都是 match —— 载荷必须如实记录，不得伪装成一次新解锁
    expect(log.payloadJson).toEqual({
      from: 'brief',
      to: 'match',
      maxReachedBefore: 'match',
      maxReachedAfter: 'match',
    });
  });

  it('每次成功推进都各写一条（两次推进 → 两条日志）', async () => {
    await advanceStage({ projectId, tenantId });
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'brief' },
    });
    await advanceStage({ projectId, tenantId });
    expect(await countLogs()).toBe(2);
  });
});
