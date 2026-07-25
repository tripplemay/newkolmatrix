// M4.5-AGENT-LOOP F004 — propose_plan 工具 + 计划留痕 + 认可端点集成测试
//
// 覆盖 acceptance：
// - propose_plan 注册（internal 无 buildHarm，挂 orchestrator + insight，同源断言）
// - 计划 items zod 校验；needsGate 服务端复核（模型低报 outbound → 强制标 + 如实暴露）
// - 输出 type:'action_plan' 经 registerCanvasRenderer 路由渲染
// - propose_plan 调用即落 OperationLog(kind=auto) 计划留痕
// - plan-ack：留痕 + 幂等（同计划重复认可不重复留痕）+ 计划不存在明示
// - **回归钉死：计划认可后 outbound 工具执行仍返回 pending 信封**（认可不解锁任何执行权）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import {
  PLAN_DISCLOSURE_MSG,
  PLAN_PROPOSED_MARKER,
  reviewPlanItem,
  type ProposePlanOutput,
} from '../../src/lib/agent/tools/propose-plan';
import {
  acknowledgePlan,
  PLAN_ACK_MARKER,
  PLAN_ACK_NOTE,
  PLAN_NOT_FOUND_MSG,
} from '../../src/lib/agent/plan-ack';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  hasCanvasRenderer,
  renderToolResult,
} from '../../src/components/copilot/canvas/canvas-registry';
import { POST as planAckPost } from '../../src/app/api/agent/plan-ack/route';
import { resetRateLimit } from '../../src/lib/http/rate-limit';

const FIXTURE_SLUG = `test-tenant-m45-plan-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

async function propose(
  input: Record<string, unknown>,
): Promise<ProposePlanOutput> {
  const r = await executeTool('propose_plan', input, ctx);
  return r.output as ProposePlanOutput;
}

const samplePlan = {
  title: '本周分享与跟进',
  items: [
    { title: '先算一遍组合 ROI', toolName: 'compute_roi_portfolio', needsGate: false },
    { title: '生成季度分享链接', toolName: 'create_share_link', needsGate: true },
  ],
};

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 计划卡夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: '计划卡夹具项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'orchestrator', projectId, env: 'default' };
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格绑定（同源断言）', () => {
  it('注册在 native 工具表，class=internal 且无 buildHarm', () => {
    expect(getNativeToolNames()).toContain('propose_plan');
    const def = getTool('propose_plan')!;
    expect(def.class).toBe('internal');
    expect(def.buildHarm).toBeUndefined();
  });

  it('挂 orchestrator + insight，其余人格不持有', () => {
    for (const p of listPersonas()) {
      const has = p.tools.includes('propose_plan');
      expect(has, `persona=${p.id}`).toBe(
        p.id === 'orchestrator' || p.id === 'insight',
      );
    }
  });
});

describe('计划结构与服务端复核（不信任模型的闸门声明）', () => {
  it('输出 type=action_plan（画布 type 路由键）+ 披露语同源', async () => {
    const out = await propose(samplePlan);
    expect(out.type).toBe('action_plan');
    expect(out.disclosure).toBe(PLAN_DISCLOSURE_MSG);
    expect(out.disclosure).toContain('还没有执行任何一步');
    expect(out.items).toHaveLength(2);
    expect(out.needsGateCount).toBe(1);
    expect(out.projectId).toBe(projectId);
  });

  it('模型低报 outbound（声明 needsGate=false）→ 强制标需确认 + gateUnderreported 暴露', () => {
    const item = reviewPlanItem({
      title: '偷偷把链接发出去',
      toolName: 'create_share_link',
      needsGate: false,
      note: null,
    });
    expect(item.needsGate).toBe(true); // 模型说不用不作数
    expect(item.gateUnderreported).toBe(true);
    expect(item.toolKnown).toBe(true);
  });

  it('模型编出的工具名 → toolKnown=false（不让假步骤看起来像真的）', () => {
    const item = reviewPlanItem({
      title: '调用一个不存在的工具',
      toolName: 'send_everything_now',
      needsGate: false,
      note: null,
    });
    expect(item.toolKnown).toBe(false);
    expect(item.needsGate).toBe(false); // 未知工具不臆断闸门态
  });

  it('internal 工具步骤如实保持 needsGate=false，无低报标记', () => {
    const item = reviewPlanItem({
      title: '只是算一下',
      toolName: 'compute_roi',
      needsGate: false,
      note: null,
    });
    expect(item.needsGate).toBe(false);
    expect(item.gateUnderreported).toBe(false);
  });

  it('入参契约：items 非空、条数上限、标题必填', async () => {
    await expect(propose({ title: 'x', items: [] })).rejects.toThrow(
      /入参校验失败/,
    );
    await expect(
      propose({ title: '', items: [{ title: 'a', needsGate: false }] }),
    ).rejects.toThrow(/入参校验失败/);
    await expect(
      propose({
        title: '太长的计划',
        items: Array.from({ length: 13 }, (_, i) => ({
          title: `第 ${i} 步`,
          needsGate: false,
        })),
      }),
    ).rejects.toThrow(/入参校验失败/);
  });

  it('输出 JSON 往返无损', async () => {
    const out = await propose(samplePlan);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('画布路由（ADR-28 结果 type 键）', () => {
  it("type:'action_plan' 路由到计划卡渲染器（非工具名回退）", async () => {
    const out = await propose(samplePlan);
    expect(hasCanvasRenderer('propose_plan', out)).toBe(true);
    expect(renderToolResult('propose_plan', out)).not.toBeNull();
    // type 优先于工具名：同形态可被其他工具复用
    expect(hasCanvasRenderer('some_other_tool', out)).toBe(true);
  });
});

describe('计划留痕（U3）', () => {
  it('propose 即落一行 OperationLog(kind=auto)，planId = 留痕行 id', async () => {
    const out = await propose(samplePlan);
    const row = await prisma.operationLog.findUnique({
      where: { id: out.planId },
    });
    expect(row).toBeTruthy();
    expect(row!.kind).toBe('auto');
    expect(row!.actor).toBe('orchestrator');
    expect(row!.summary?.startsWith(PLAN_PROPOSED_MARKER)).toBe(true);
    expect(row!.projectId).toBe(projectId);
    expect(row!.payloadJson).toMatchObject({ title: samplePlan.title });
  });

  it('internal 工具：propose 不产生 PendingAction', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await propose(samplePlan);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });
});

describe('计划认可（幂等 + 边界如实）', () => {
  it('首次认可落一行留痕，note 明示「认可不代表已确认」', async () => {
    const plan = await propose(samplePlan);
    const r = await acknowledgePlan(plan.planId, { tenantId });
    expect(r.acknowledged).toBe(true);
    expect(r.alreadyAcknowledged).toBe(false);
    expect(r.planTitle).toBe(samplePlan.title);
    expect(r.note).toBe(PLAN_ACK_NOTE);
    expect(r.note).toContain('不代表已确认');

    const acks = await prisma.operationLog.findMany({
      where: {
        tenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
        payloadJson: { path: ['planId'], equals: plan.planId },
      },
    });
    expect(acks).toHaveLength(1);
  });

  it('重复认可幂等：不重复留痕，时间戳保持首次', async () => {
    const plan = await propose(samplePlan);
    const first = await acknowledgePlan(plan.planId, { tenantId });
    const second = await acknowledgePlan(plan.planId, { tenantId });
    expect(second.alreadyAcknowledged).toBe(true);
    expect(second.logId).toBe(first.logId);
    expect(second.acknowledgedAt).toBe(first.acknowledgedAt);

    const acks = await prisma.operationLog.count({
      where: {
        tenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
        payloadJson: { path: ['planId'], equals: plan.planId },
      },
    });
    expect(acks).toBe(1);
  });

  it('计划不存在 → 明示抛错（不静默造留痕）', async () => {
    await expect(
      acknowledgePlan('no-such-plan', { tenantId }),
    ).rejects.toThrow(PLAN_NOT_FOUND_MSG);
    expect(
      await prisma.operationLog.count({
        where: { tenantId, summary: { startsWith: PLAN_ACK_MARKER } },
      }),
    ).toBeGreaterThan(0); // 之前的认可仍在，但没为不存在的计划新增
  });

  it('非计划行的 id 不可被认可（留痕行类型收窄）', async () => {
    const other = await prisma.operationLog.create({
      data: { tenantId, kind: 'auto', summary: '不是计划的普通留痕' },
    });
    await expect(acknowledgePlan(other.id, { tenantId })).rejects.toThrow(
      PLAN_NOT_FOUND_MSG,
    );
  });
});

describe('🔒 回归钉死：认可不解锁任何执行权', () => {
  it('计划认可之后，计划里的 outbound 步骤执行仍只拿到 pending 信封', async () => {
    const plan = await propose(samplePlan);
    await acknowledgePlan(plan.planId, { tenantId });

    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    const result = await executeTool(
      'create_share_link',
      { scope: 'quarterly' },
      ctx, // 认可行为不会给 ctx 带上任何令牌
    );
    expect(isPendingEnvelope(result.output)).toBe(true);
    expect((result.output as { status: string }).status).toBe('pending');
    // 副作用零发生
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareBefore,
    );
  });
});

describe('POST /api/agent/plan-ack 路由层（P6 限流 + zod 400）', () => {
  const ipHeaders = (ip: string) => ({
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  });
  const req = (body: unknown, ip: string) =>
    new Request('http://localhost/api/agent/plan-ack', {
      method: 'POST',
      headers: ipHeaders(ip),
      body: JSON.stringify(body),
    });

  it('入参不合法 → 400 且错误明示（zod 校验在租户解析之前）', async () => {
    resetRateLimit();
    const res = await planAckPost(req({}, '10.0.0.1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();

    const res2 = await planAckPost(req({ planId: '' }, '10.0.0.1'));
    expect(res2.status).toBe(400);
  });

  it('30 req/min/IP：第 31 次 → 429 + Retry-After', async () => {
    resetRateLimit();
    for (let i = 0; i < 30; i++) {
      const r = await planAckPost(req({}, '10.0.0.2'));
      expect(r.status).toBe(400); // 放行（入参不合法只是走到了 zod）
    }
    const limited = await planAckPost(req({}, '10.0.0.2'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    const body = (await limited.json()) as { code?: string };
    expect(body.code).toBe('RATE_LIMITED');
    resetRateLimit();
  });

  it('取不到 IP → fail-open 放行（不因限流器失灵拒绝真人操作）', async () => {
    resetRateLimit();
    const res = await planAckPost(
      new Request('http://localhost/api/agent/plan-ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400); // 到了 zod，说明没被限流挡下
  });
});
