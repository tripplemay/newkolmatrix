// M3-B-DELIVERY F011（BL-BRIEF-GOAL）— goal 写入口集成测试（打真库）
//
// 覆盖 acceptance：
// - 服务层单一真相源（工具与 API 共用 setProjectGoal，不各写一份）
// - zod：targetExposure 非负整数 / ISO 日期 / periodStart<periodEnd，坏入参 400 逐字段明示
// - confirm_brief_goal 注册 + 挂 strategy/orchestrator + class=internal（不过闸门）
// - 写 OperationLog 留痕（from/to 可追溯）
// - **端到端**：新建项目（goal=null）→ →match 守卫拒 BRIEF_GOAL_NOT_CONFIRMED →
//   确认 goal → 守卫放行 → advanceStage 成功

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { createProject } from '../../src/lib/projects/create';
import {
  setProjectGoal,
  setProjectGoalInputSchema,
} from '../../src/lib/projects/set-goal';
import { advanceStage } from '../../src/lib/domain/env-advance';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { PATCH as patchGoal } from '../../src/app/api/projects/[id]/goal/route';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { ConfirmBriefGoalOutput } from '../../src/lib/agent/tools/confirm-brief-goal';

const FIXTURE_SLUG = `test-tenant-m3b-goal-${process.pid}`;

let tenantId: string;
let ctx: ToolContext;

const GOOD = {
  targetExposure: 3_000_000,
  periodStart: '2026-08-01',
  periodEnd: '2026-09-30',
};

async function newProject(name: string) {
  const r = await createProject(tenantId, { name }, { actor: 'operator' });
  if (r.ok !== true) throw new Error('夹具项目创建失败');
  return r.project.id;
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B goal 夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'strategy', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格', () => {
  it('confirm_brief_goal 已注册、class=internal、无 buildHarm（不过闸门 D27）', () => {
    const tool = getTool('confirm_brief_goal');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('internal');
    expect(tool?.buildHarm).toBeUndefined();
  });

  it('挂 strategy + orchestrator 人格，且声明的工具名真实存在（同源断言）', () => {
    const personas = listPersonas();
    for (const id of ['strategy', 'orchestrator']) {
      const p = personas.find((x) => x.id === id);
      expect(p?.tools, `${id} 未挂 confirm_brief_goal`).toContain(
        'confirm_brief_goal',
      );
      for (const name of p?.tools ?? []) {
        expect(getTool(name), `${id} 声明的 ${name} 不在注册表`).toBeTruthy();
      }
    }
  });
});

describe('服务层：zod 校验与落库', () => {
  it('坏入参逐条被拒：负数 / 非整数 / 非 ISO 日期 / 起止倒置', () => {
    const bad = [
      { ...GOOD, targetExposure: -1 },
      { ...GOOD, targetExposure: 1.5 },
      { ...GOOD, periodStart: '2026/08/01' },
      { ...GOOD, periodStart: '2026-09-30', periodEnd: '2026-08-01' },
      { ...GOOD, periodStart: '2026-08-01', periodEnd: '2026-08-01' }, // 零长度周期
    ];
    for (const input of bad) {
      expect(
        setProjectGoalInputSchema.safeParse(input).success,
        JSON.stringify(input),
      ).toBe(false);
    }
    expect(setProjectGoalInputSchema.safeParse(GOOD).success).toBe(true);
  });

  it('确认落库 + OperationLog 留痕（from=null → to=goal）', async () => {
    const projectId = await newProject('目标确认夹具');
    const r = await setProjectGoal(tenantId, projectId, GOOD, {
      actor: 'operator',
    });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.replaced).toBe(false);

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.goal).toEqual(GOOD);

    const log = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r.logId },
    });
    expect(log.kind).toBe('auto');
    expect(log.projectId).toBe(projectId);
    const payload = log.payloadJson as { from: unknown; to: unknown };
    expect(payload.from).toBeNull();
    expect(payload.to).toEqual(GOOD);
  });

  it('重复确认 = 覆盖并留痕（replaced=true，from 带旧值）', async () => {
    const projectId = await newProject('目标覆盖夹具');
    await setProjectGoal(tenantId, projectId, GOOD, { actor: 'operator' });
    const next = { ...GOOD, targetExposure: 5_000_000 };
    const r = await setProjectGoal(tenantId, projectId, next, {
      actor: 'operator',
    });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.replaced).toBe(true);
    const log = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r.logId },
    });
    const payload = log.payloadJson as { from: unknown; to: unknown };
    expect(payload.from).toEqual(GOOD);
    expect(payload.to).toEqual(next);
  });

  it('publicId / slug 口径同样可用；项目不存在 → PROJECT_NOT_FOUND', async () => {
    const projectId = await newProject('口径夹具');
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const byPublic = await setProjectGoal(tenantId, row.publicId, GOOD, {
      actor: 'operator',
    });
    expect(byPublic.ok).toBe(true);
    const missing = await setProjectGoal(tenantId, 'nope', GOOD, {
      actor: 'operator',
    });
    expect(missing).toEqual({ ok: false, code: 'PROJECT_NOT_FOUND' });
  });

  it('跨租户不可写（tenantId 不匹配即视为不存在）', async () => {
    const projectId = await newProject('跨租户夹具');
    const r = await setProjectGoal(tenantId + '-other', projectId, GOOD, {
      actor: 'operator',
    });
    expect(r.ok).toBe(false);
  });
});

describe('工具与 API 共用同一服务（单一真相源）', () => {
  it('confirm_brief_goal 落库结果与服务层一致，并带指路语义', async () => {
    const projectId = await newProject('工具入口夹具');
    const r = await executeTool(
      'confirm_brief_goal',
      { projectId, ...GOOD },
      ctx,
    );
    const out = r.output as ConfirmBriefGoalOutput;
    expect(out.confirmed).toBe(true);
    expect(out.goal).toEqual(GOOD);
    expect(out.next).toContain('创作者匹配');
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.goal).toEqual(GOOD);
    // 留痕 actor = 调用人格（不是 operator）——审计能分辨谁确认的
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, summary: { contains: '确认项目' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.actor).toBe('strategy');
  });

  it('工具层坏周期 → 结构化 reason 而非裸 zod 错（模型可读）', async () => {
    const projectId = await newProject('坏周期夹具');
    const r = await executeTool(
      'confirm_brief_goal',
      { projectId, ...GOOD, periodStart: '2026-09-01', periodEnd: '2026-08-01' },
      ctx,
    );
    const out = r.output as ConfirmBriefGoalOutput;
    expect(out.confirmed).toBe(false);
    expect(out.reason).toBe('INVALID_PERIOD');
  });

  it('PATCH 路由：坏入参 400 且逐字段明示', async () => {
    const res = await patchGoal(
      new Request('http://x/api/projects/p1/goal', {
        method: 'PATCH',
        body: JSON.stringify({ ...GOOD, targetExposure: -5 }),
      }),
      { params: Promise.resolve({ id: 'p1' }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; issues: unknown[] };
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('PATCH 路由：非法 JSON → 400 而不是 500', async () => {
    const res = await patchGoal(
      new Request('http://x/api/projects/p1/goal', {
        method: 'PATCH',
        body: '{ oops',
      }),
      { params: Promise.resolve({ id: 'p1' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('端到端：goal 确认解锁 →match（BL-BRIEF-GOAL 的实质）', () => {
  it('新建项目 → 守卫拒 BRIEF_GOAL_NOT_CONFIRMED → 确认 goal → 放行 → 推进成功', async () => {
    const projectId = await newProject('端到端夹具');

    // ① 新建项目 goal=null（create 服务不写 goal，P3 不越环节）
    const fresh = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(fresh.goal).toBeNull();
    expect(fresh.cur).toBe('brief');

    // ② →match 被守卫拒
    const denied = await advanceStage({ projectId, tenantId });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe('BRIEF_GOAL_NOT_CONFIRMED');
    expect(denied.logId).toBeNull();

    // ③ 经工具确认目标
    const confirmed = await executeTool(
      'confirm_brief_goal',
      { projectId, ...GOOD },
      ctx,
    );
    expect((confirmed.output as ConfirmBriefGoalOutput).confirmed).toBe(true);

    // ④ 守卫放行 → 推进成功
    const advanced = await advanceStage({ projectId, tenantId });
    expect(advanced.ok).toBe(true);
    expect(advanced.cur).toBe('match');
    const after = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(after.cur).toBe('match');
    expect(after.maxReached).toBe('match');
  });
});
