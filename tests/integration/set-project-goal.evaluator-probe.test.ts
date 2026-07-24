// M3-B-DELIVERY F011 — Evaluator 独立探针（不改产品代码，仅新增测试产物）
//
// 立场：Generator 的 set-project-goal.test.ts 走「工具入口」验证端到端。本探针刻意走
// **API/HTTP 入口（PATCH /api/projects/[id]/goal）** 复验同一 acceptance——若「单一真相源」
// 名副其实，两条入口应产生等价落库与解锁效果。附加对抗式 zod / internal 不过闸门断言。
//
// acceptance 对账（features.json F011）：
// - 服务层单一真相源（工具与 API 共用 setProjectGoal，不各写一份）
// - zod：targetExposure 非负整数 / periodStart<periodEnd / ISO date；坏入参 400 明示
// - confirm_brief_goal 注册 + class=internal（无确认框：executeTool 不产 PendingAction）
// - 写 OperationLog 留痕
// - 端到端：新建项目(goal=null) → →match 拒 → 【经 PATCH API】确认 goal → 放行 → advanceStage 成功

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { createProject } from '../../src/lib/projects/create';
import { setProjectGoalInputSchema } from '../../src/lib/projects/set-goal';
import { advanceStage } from '../../src/lib/domain/env-advance';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { PATCH as patchGoal } from '../../src/app/api/projects/[id]/goal/route';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3b-f011probe-${process.pid}`;

let tenantId: string;
let devTenantId: string;
let ctx: ToolContext;
// route 用 getDevTenantId() 解析租户（单租户 dev），故经 API 入口的项目须建在 dev tenant 下。
const devProjectIds: string[] = [];

async function newDevProject(name: string): Promise<string> {
  const r = await createProject(devTenantId, { name }, { actor: 'operator' });
  if (r.ok !== true) throw new Error('dev tenant 夹具项目创建失败');
  devProjectIds.push(r.project.id);
  return r.project.id;
}

const GOOD = {
  targetExposure: 1_500_000,
  periodStart: '2026-10-01',
  periodEnd: '2026-12-31',
};

async function newProject(name: string): Promise<string> {
  const r = await createProject(tenantId, { name }, { actor: 'operator' });
  if (r.ok !== true) throw new Error('夹具项目创建失败');
  return r.project.id;
}

function patchReq(id: string, body: unknown) {
  return patchGoal(
    new Request(`http://x/api/projects/${id}/goal`, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'F011 probe 租户' },
  });
  tenantId = t.id;
  const { getDevTenantId } = await import('../../src/lib/agent/context');
  devTenantId = await getDevTenantId();
  ctx = { tenantId, agentId: 'orchestrator', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  // 清理经 API 入口在 dev tenant 下造的探针项目（按 id 精确清，不动其它数据）
  if (devProjectIds.length > 0) {
    await prisma.operationLog.deleteMany({
      where: { projectId: { in: devProjectIds } },
    });
    await prisma.project.deleteMany({ where: { id: { in: devProjectIds } } });
  }
  await prisma.$disconnect();
});

describe('F011 探针 · zod 对抗边界（服务层单一 schema）', () => {
  it('拒：超大浮点 / NaN / 缺字段 / 非法月份 / 起止倒置；纳：合法输入', () => {
    const bad: unknown[] = [
      { ...GOOD, targetExposure: -0.0001 },
      { ...GOOD, targetExposure: Number.NaN },
      { ...GOOD, targetExposure: 3.14 },
      { periodStart: GOOD.periodStart, periodEnd: GOOD.periodEnd }, // 缺 targetExposure
      { ...GOOD, periodStart: '2026-13-01' }, // 非法月份
      { ...GOOD, periodStart: '2026-10-31', periodEnd: '2026-10-01' }, // 倒置
      { ...GOOD, periodStart: '2026-10-01', periodEnd: '2026-10-01' }, // 零长度
      { ...GOOD, targetExposure: '1500000' }, // 字符串不强转
    ];
    for (const input of bad) {
      expect(
        setProjectGoalInputSchema.safeParse(input).success,
        `应拒: ${JSON.stringify(input)}`,
      ).toBe(false);
    }
    expect(setProjectGoalInputSchema.safeParse(GOOD).success).toBe(true);
    // targetExposure=0 是合法边界（非负整数含 0）
    expect(
      setProjectGoalInputSchema.safeParse({ ...GOOD, targetExposure: 0 })
        .success,
    ).toBe(true);
  });
});

describe('F011 探针 · confirm_brief_goal 是 internal（无确认框，不产 PendingAction）', () => {
  it('executeTool 走 internal 分支：直接执行落库，不返回 pending 信封', async () => {
    const projectId = await newProject('internal 探针夹具');
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const r = await executeTool(
      'confirm_brief_goal',
      { projectId, ...GOOD },
      ctx,
    );
    // internal 工具输出是业务结果（confirmed:true），不是 pending 信封（无 harm/status 字段）
    const out = r.output as Record<string, unknown>;
    expect(out.confirmed).toBe(true);
    expect(out).not.toHaveProperty('harm');
    expect(out).not.toHaveProperty('pendingActionId');
    const after = await prisma.pendingAction.count({ where: { tenantId } });
    expect(after, 'internal 工具不得产生 PendingAction').toBe(before);
    // 确实落库
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.goal).toEqual(GOOD);
    // tool 定义层面：class=internal 且无 buildHarm
    const def = getTool('confirm_brief_goal');
    expect(def?.class).toBe('internal');
    expect(def?.buildHarm).toBeUndefined();
  });
});

describe('F011 探针 · PATCH API 入口（第二入口复验单一真相源）', () => {
  it('happy path：PATCH 成功落库 + actor=operator 留痕（区别于工具的人格 actor）', async () => {
    // route 用 getDevTenantId() 解析租户（单租户 dev 的正确行为）——项目须建在 dev tenant 下
    const projectId = await newDevProject('PATCH happy 夹具');
    const res = await patchReq(projectId, GOOD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      confirmed: boolean;
      goal: unknown;
      replaced: boolean;
    };
    expect(body.confirmed).toBe(true);
    expect(body.goal).toEqual(GOOD);
    expect(body.replaced).toBe(false);

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.goal).toEqual(GOOD);

    // API 入口 actor = 'operator'（人直接操作），与工具入口的人格名区分
    const log = await prisma.operationLog.findFirst({
      where: { projectId, summary: { contains: '确认项目' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.actor).toBe('operator');
    expect(log?.kind).toBe('auto');
    const payload = log?.payloadJson as {
      action: string;
      from: unknown;
      to: unknown;
    };
    expect(payload.action).toBe('project.goal_confirmed');
    expect(payload.from).toBeNull();
    expect(payload.to).toEqual(GOOD);
  });

  it('PATCH 起止倒置 → 400（refine 经 API 入口生效，非只在服务层直调）', async () => {
    const projectId = await newProject('PATCH refine 夹具');
    const res = await patchReq(projectId, {
      ...GOOD,
      periodStart: '2026-12-31',
      periodEnd: '2026-10-01',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      code: string;
      issues: { path: string }[];
    };
    expect(body.code).toBe('INVALID_INPUT');
    // periodEnd 字段被 refine 标注
    expect(body.issues.some((i) => i.path === 'periodEnd')).toBe(true);
  });

  it('PATCH 项目不存在 → 404（非 500）', async () => {
    const res = await patchReq('does-not-exist-xyz', GOOD);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('F011 探针 · 端到端经 PATCH API 解锁 →match', () => {
  it('新建(goal=null) → advanceStage 拒 → PATCH 确认 → advanceStage 放行到 match', async () => {
    // 项目建在 dev tenant 下（route 服务端解析该租户），端到端才走得通
    const pid = await newDevProject(`f011probe-e2e-${process.pid}`);

    // ① 新建 goal=null，仍在 brief
    const fresh = await prisma.project.findUniqueOrThrow({
      where: { id: pid },
    });
    expect(fresh.goal).toBeNull();
    expect(fresh.cur).toBe('brief');

    // ② →match 被守卫硬拒（服务端 advanceStage 是硬闸，非前端 UX）
    const denied = await advanceStage({
      projectId: pid,
      tenantId: devTenantId,
    });
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe('BRIEF_GOAL_NOT_CONFIRMED');
    expect(denied.logId).toBeNull();

    // ③ 经 PATCH API 确认目标
    const res = await patchReq(pid, GOOD);
    expect(res.status).toBe(200);

    // ④ 守卫放行 → 推进到 match
    const advanced = await advanceStage({
      projectId: pid,
      tenantId: devTenantId,
    });
    expect(advanced.ok).toBe(true);
    expect(advanced.cur).toBe('match');
    const after = await prisma.project.findUniqueOrThrow({
      where: { id: pid },
    });
    expect(after.cur).toBe('match');
    expect(after.maxReached).toBe('match');
  });
});
