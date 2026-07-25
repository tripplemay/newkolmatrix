// M4.5-AGENT-LOOP · Evaluator(G4) 独立探针 — F004 行动计划卡 / propose_plan / plan-ack
//
// 独立性说明：本文件由 Evaluator 在隔离上下文自写。与 Generator 的
// tests/integration/propose-plan.test.ts 刻意走**不同的攻击面**，只在红线条款上重复：
//   ① 端点层 happy path（Generator 的路由测试只喂了非法入参，200 这条路从没被 HTTP 层跑过）
//   ② 跨租户越权认可（Generator 未测）
//   ③ 并发重入下的幂等（Generator 只测了串行重入）
//   ④ 留痕**载荷内容**是服务端复核值而非模型自报值（Generator 只比对了 title）
//   ⑤ 计划卡渲染产物断言（Generator 无任何渲染断言，「如实标需你确认」在其证据里是空的）
//   ⑥ 限流的 escape hatch 与桶隔离
//   ⑦ 认可后 outbound 仍 pending —— 红线，刻意与 Generator 重复并加验令牌面
//
// 夹具隔离（并行纪律）：租户 slug 带 G4 + pid；dev 租户上只创建带 G4 标记的留痕行，
// 用完按 id 精确删除并核证零残留。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getDevTenantId } from '../../src/lib/agent/context';
import {
  PLAN_PROPOSED_MARKER,
  type ProposePlanOutput,
} from '../../src/lib/agent/tools/propose-plan';
import { acknowledgePlan, PLAN_ACK_MARKER } from '../../src/lib/agent/plan-ack';
import { POST as planAckPost } from '../../src/app/api/agent/plan-ack/route';
import { resetRateLimit } from '../../src/lib/http/rate-limit';
import PlanCard from '../../src/components/copilot/canvas/PlanCard';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const TAG = `G4-${process.pid}`;
const FIXTURE_SLUG = `test-tenant-m45-g4-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;
let devTenantId: string;
/** dev 租户上由本探针创建的留痕行 id —— 收尾按 id 精确删除。 */
const devRowIds = new Set<string>();

const planInput = (title = `${TAG} 计划`) => ({
  title,
  items: [
    { title: '算一遍 ROI', toolName: 'compute_roi', needsGate: false },
    // 模型低报：outbound 却自称不需确认
    { title: '发个分享链接', toolName: 'create_share_link', needsGate: false },
  ],
});

async function propose(
  input: Record<string, unknown>,
  c: ToolContext = ctx,
): Promise<ProposePlanOutput> {
  const r = await executeTool('propose_plan', input, c);
  return r.output as ProposePlanOutput;
}

beforeAll(async () => {
  getNativeToolNames();
  devTenantId = await getDevTenantId();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: `M4.5 G4 探针租户 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'G4 探针项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'orchestrator', projectId, env: 'default' };
});

afterAll(async () => {
  // dev 租户：删本探针自己创建的行。
  // ① 按 id（正常路径）② 再按 TAG 标记兜底扫一遍——
  // 变异测试实测教训：实现被改坏时（如幂等失效）会产出**没被 id 追踪到**的额外行，
  // 只删 id 会留残留（本轮实测遗留 4 行，人工补删）。标记扫描保证任何路径都零残留。
  if (devRowIds.size > 0) {
    await prisma.operationLog.deleteMany({
      where: { id: { in: [...devRowIds] } },
    });
  }
  await prisma.operationLog.deleteMany({
    where: { tenantId: devTenantId, summary: { contains: TAG } },
  });
  // 夹具租户：整租户清理
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });

  // 零残留核证（写进报告的依据）
  const leftoverTenant = await prisma.tenant.count({
    where: { slug: FIXTURE_SLUG },
  });
  const leftoverDev = await prisma.operationLog.count({
    where: { tenantId: devTenantId, summary: { contains: TAG } },
  });
  // eslint-disable-next-line no-console
  console.log(
    `[G4 清理核证] 夹具租户残留=${leftoverTenant} · dev 租户 G4 留痕残留=${leftoverDev}`,
  );
  expect(leftoverTenant).toBe(0);
  expect(leftoverDev).toBe(0);
  await prisma.$disconnect();
});

/* ══════════════════════ 1. 工具契约（zod 边界，独立取值） ══════════════════════ */

describe('F004-G4 · propose_plan 入参契约边界', () => {
  it('needsGate 是必填——模型不表态就不给过（默认值会变成静默低报）', async () => {
    await expect(
      propose({ title: 'x', items: [{ title: '一步' }] }),
    ).rejects.toThrow(/入参校验失败/);
  });

  it('边界取值：items 12 条通过 / 13 条拒；标题 120 字通过 / 121 拒', async () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        title: `第${i}步`,
        needsGate: false,
      }));
    const ok = await propose({ title: `${TAG} 12步`, items: mk(12) });
    expect(ok.items).toHaveLength(12);
    await expect(
      propose({ title: `${TAG} 13步`, items: mk(13) }),
    ).rejects.toThrow(/入参校验失败/);

    const t120 = 'あ'.repeat(120);
    const okT = await propose({ title: t120, items: mk(1) });
    expect(okT.title).toBe(t120);
    await expect(
      propose({ title: 'あ'.repeat(121), items: mk(1) }),
    ).rejects.toThrow(/入参校验失败/);
  });

  it('步骤 title 200 / note 500 / toolName 64 为上界，越界即拒', async () => {
    const base = (item: Record<string, unknown>) => ({
      title: `${TAG} 边界`,
      items: [item],
    });
    await expect(
      propose(base({ title: 'a'.repeat(201), needsGate: false })),
    ).rejects.toThrow(/入参校验失败/);
    await expect(
      propose(base({ title: 'ok', needsGate: false, note: 'n'.repeat(501) })),
    ).rejects.toThrow(/入参校验失败/);
    await expect(
      propose(
        base({ title: 'ok', needsGate: false, toolName: 'x'.repeat(65) }),
      ),
    ).rejects.toThrow(/入参校验失败/);
    const ok = await propose(
      base({ title: 'a'.repeat(200), needsGate: false, note: 'n'.repeat(500) }),
    );
    expect(ok.items[0]!.note).toHaveLength(500);
  });

  it('注册面：class=internal、无 buildHarm、只挂 orchestrator+insight', () => {
    const def = getTool('propose_plan')!;
    expect(def.class).toBe('internal');
    expect(def.buildHarm).toBeUndefined();
    const holders = listPersonas()
      .filter((p) => p.tools.includes('propose_plan'))
      .map((p) => p.id)
      .sort();
    expect(holders).toEqual(['insight', 'orchestrator']);
  });
});

/* ══════════════════════ 2. 留痕载荷 = 服务端复核值 ══════════════════════ */

describe('F004-G4 · 计划留痕（落的是复核后的事实，不是模型自报）', () => {
  it('OperationLog(kind=auto) 的 payloadJson 里 outbound 步骤已被改写为 needsGate=true + 低报标记', async () => {
    const out = await propose(planInput(`${TAG} 低报`));
    expect(out.items[1]!.needsGate).toBe(true);
    expect(out.items[1]!.gateUnderreported).toBe(true);

    const row = await prisma.operationLog.findUnique({
      where: { id: out.planId },
      select: { kind: true, actor: true, summary: true, payloadJson: true },
    });
    expect(row!.kind).toBe('auto');
    const payload = row!.payloadJson as unknown as {
      items: Array<{ needsGate: boolean; gateUnderreported: boolean }>;
      needsGateCount: number;
    };
    // 若这里落的是模型自报值，事后审计会看到「模型说不用确认」→ 留痕即失真
    expect(payload.items[1]!.needsGate).toBe(true);
    expect(payload.items[1]!.gateUnderreported).toBe(true);
    expect(payload.needsGateCount).toBe(1);
    expect(row!.summary!.startsWith(PLAN_PROPOSED_MARKER)).toBe(true);
  });

  it('留痕不含闸门令牌 / PendingAction 引用（计划态不得携带任何可执行凭据）', async () => {
    const out = await propose(planInput(`${TAG} 无令牌`));
    const row = await prisma.operationLog.findUnique({
      where: { id: out.planId },
    });
    const blob = JSON.stringify(row);
    for (const forbidden of [
      'confirmationToken',
      'pendingActionId',
      'ticket',
      'token',
    ]) {
      expect(blob.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(row!.ref).toBeNull();
  });
});

/* ══════════════════════ 3. plan-ack HTTP 端点（happy path 首次被跑通） ══════════════════════ */

describe('F004-G4 · POST /api/agent/plan-ack 端到端（真 planId）', () => {
  const post = (body: unknown, ip = '10.4.4.1') =>
    planAckPost(
      new Request('http://localhost/api/agent/plan-ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    );

  it('dev 租户真计划 → 200 + 幂等重入 alreadyAcknowledged=true，且只落一行认可', async () => {
    resetRateLimit();
    const devCtx: ToolContext = {
      tenantId: devTenantId,
      agentId: 'orchestrator',
      projectId: null,
      env: 'default',
    };
    const plan = await propose(planInput(`${TAG} 端点`), devCtx);
    devRowIds.add(plan.planId);

    const r1 = await post({ planId: plan.planId });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as {
      acknowledged: boolean;
      alreadyAcknowledged: boolean;
      logId: string;
      note: string;
    };
    devRowIds.add(b1.logId);
    expect(b1.acknowledged).toBe(true);
    expect(b1.alreadyAcknowledged).toBe(false);
    expect(b1.note).toContain('不代表已确认');

    const r2 = await post({ planId: plan.planId });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as {
      alreadyAcknowledged: boolean;
      logId: string;
    };
    expect(b2.alreadyAcknowledged).toBe(true);
    expect(b2.logId).toBe(b1.logId);

    const acks = await prisma.operationLog.count({
      where: {
        tenantId: devTenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
        payloadJson: { path: ['planId'], equals: plan.planId },
      },
    });
    expect(acks).toBe(1);

    // 认可端点不得产生任何 PendingAction（不是确认动线）
    const pendings = await prisma.pendingAction.count({
      where: {
        tenantId: devTenantId,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    expect(pendings).toBe(0);
  });

  it('不存在的 planId → 404 且不留痕', async () => {
    resetRateLimit();
    const before = await prisma.operationLog.count({
      where: {
        tenantId: devTenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
      },
    });
    const res = await post({ planId: 'g4-no-such-plan' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    // eslint-disable-next-line no-console
    console.log(`[G4 端点错误体] 404 body = ${JSON.stringify(body)}`);
    const after = await prisma.operationLog.count({
      where: {
        tenantId: devTenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
      },
    });
    expect(after).toBe(before);
    // 观察项（不构成 acceptance 判定）：错误体把服务端内部前缀原样透传给客户端。
    // 同批 /api/actions/* 的 gateErrorResponse 对「非预期错误」是「泛化文案 + 500 + 服务端 log」，
    // 本端点是「原样 message + 400」。此处只如实记录事实，不在断言上钉死行为。
    expect(typeof body.error).toBe('string');
  });

  it('🔒 跨租户：他人租户的 planId 无法经端点（dev 租户视角）被认可', async () => {
    resetRateLimit();
    const foreign = await propose(planInput(`${TAG} 越权`)); // 落在夹具租户
    const res = await post({ planId: foreign.planId });
    expect(res.status).toBe(404);
    const leaked = await prisma.operationLog.count({
      where: {
        summary: { startsWith: PLAN_ACK_MARKER },
        payloadJson: { path: ['planId'], equals: foreign.planId },
      },
    });
    expect(leaked).toBe(0);
  });

  it('zod 400 明示 + 30/min 限流 + fail-open + escape hatch', async () => {
    resetRateLimit();
    const bad = await post({ planId: 123 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBeTruthy();

    // 30 放行 / 第 31 → 429
    resetRateLimit();
    for (let i = 0; i < 30; i++) {
      expect((await post({}, '10.4.4.9')).status).toBe(400);
    }
    const limited = await post({}, '10.4.4.9');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    // 另一 IP 不受影响（按 IP 分桶）
    expect((await post({}, '10.4.4.10')).status).toBe(400);

    // escape hatch
    process.env.DISABLE_GATE_RATELIMIT = 'true';
    expect((await post({}, '10.4.4.9')).status).toBe(400);
    delete process.env.DISABLE_GATE_RATELIMIT;
    resetRateLimit();
  });
});

/* ══════════════════════ 4. 并发重入下的幂等 ══════════════════════ */

describe('F004-G4 · 幂等在并发下的实际表现', () => {
  it('同一计划 12 路并发认可 —— 实测留痕行数', async () => {
    const plan = await propose(planInput(`${TAG} 并发`));
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        acknowledgePlan(plan.planId, { tenantId }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rows = await prisma.operationLog.count({
      where: {
        tenantId,
        summary: { startsWith: PLAN_ACK_MARKER },
        payloadJson: { path: ['planId'], equals: plan.planId },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[G4 并发幂等] 成功=${ok}/12 · 认可留痕行数=${rows}`);
    // 事实断言：串行幂等已由 Generator 覆盖；此处记录并发下的真实行数。
    // 判据取「不产生可执行副作用」+ 行数上界，不苛求强序列化（该端点无执行权）。
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(rows).toBeLessThanOrEqual(12);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(0);
  });
});

/* ══════════════════════ 5. 红线：认可不解锁执行权 ══════════════════════ */

describe('F004-G4 · 🔒 红线回归（认可 ≠ 确认 ≠ 执行）', () => {
  it('认可后执行计划中的 outbound 步骤：仍是 pending 信封，零副作用，ctx 无令牌', async () => {
    const plan = await propose(planInput(`${TAG} 红线`));
    const ack = await acknowledgePlan(plan.planId, { tenantId });
    expect(ack.acknowledged).toBe(true);

    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    const res = await executeTool(
      'create_share_link',
      { scope: 'quarterly' },
      ctx,
    );

    expect(isPendingEnvelope(res.output)).toBe(true);
    expect((res.output as { status: string }).status).toBe('pending');
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareBefore,
    );
    // 认可流程没有往 ctx 里塞任何令牌
    expect(
      (ctx as { confirmationToken?: string }).confirmationToken,
    ).toBeUndefined();

    // PendingAction 落在 pending 态，仍需两步票据
    const pa = await prisma.pendingAction.findUnique({
      where: {
        id: (res.output as { pendingActionId: string }).pendingActionId,
      },
      select: { status: true },
    });
    expect(pa!.status).toBe('pending');
  });

  it('认可留痕本身不是 outbound：kind=auto、actor=human、无 PendingAction', async () => {
    const plan = await propose(planInput(`${TAG} 留痕类型`));
    const r = await acknowledgePlan(plan.planId, { tenantId });
    const row = await prisma.operationLog.findUnique({
      where: { id: r.logId },
    });
    expect(row!.kind).toBe('auto');
    expect(row!.actor).toBe('human');
  });
});

/* ══════════════════════ 6. 计划卡渲染产物（acceptance「如实标需你确认」） ══════════════════════ */

describe('F004-G4 · PlanCard 渲染产物（Generator 无渲染断言，此处补齐）', () => {
  const render = (out: ProposePlanOutput) =>
    renderToStaticMarkup(createElement(PlanCard, { output: out }));

  /**
   * 逐条切出步骤行（<li>），只在**行内**找标注。
   *
   * 【为什么不能直接对整卡 html 数「需你确认」出现次数】——变异 M7（去掉 item 级徽标）
   * 在整卡计数下**存活**：卡头「其中 N 步需你确认」与披露语「标了「需你确认」的动作…」
   * 各自贡献一次，整卡计数仍 ≥2。整卡计数因此不是承重断言，必须落到行级。
   */
  const itemRows = (html: string): string[] =>
    html
      .split('<li ')
      .slice(1)
      .map((s) => s.split('</li>')[0]!);

  it('needsGate 步骤逐条标「需你确认」（行级断言，非整卡计数）', async () => {
    const out = await propose({
      title: `${TAG} 渲染`,
      items: [
        { title: '只读一步', toolName: 'compute_roi', needsGate: false },
        {
          title: '漏标的外呼',
          toolName: 'create_share_link',
          needsGate: false,
        },
        {
          title: '编的工具',
          toolName: 'send_everything_now',
          needsGate: false,
        },
        { title: '模型自己承认要确认', needsGate: true },
      ],
    });
    const html = render(out);
    const rows = itemRows(html);
    expect(rows).toHaveLength(4);

    // 逐行核对：标注只出现在该出现的行上，一个不多一个不少
    expect(out.items.map((i) => i.needsGate)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    rows.forEach((row, i) => {
      expect(row.includes('需你确认'), `第 ${i + 1} 行闸门标注`).toBe(
        out.items[i]!.needsGate,
      );
      expect(row.includes('模型漏标'), `第 ${i + 1} 行低报标注`).toBe(
        out.items[i]!.gateUnderreported,
      );
      expect(row.includes('无此工具'), `第 ${i + 1} 行未知工具标注`).toBe(
        !out.items[i]!.toolKnown,
      );
    });
    // 低报与未知工具确实各命中一行（否则上面的逐行断言可被「全 false」空过）
    expect(rows.filter((r) => r.includes('需你确认'))).toHaveLength(2);
    expect(rows.filter((r) => r.includes('模型漏标'))).toHaveLength(1);
    expect(rows.filter((r) => r.includes('无此工具'))).toHaveLength(1);

    // 卡头计数与披露语（与工具产物同源，前端未另写弱化措辞）
    expect(out.needsGateCount).toBe(2);
    expect(html).toContain('其中 2 步需你确认');
    expect(html).toContain('还没有执行任何一步');
    expect(html).toContain(out.disclosure.slice(0, 12));
  });

  it('全部步骤无需确认时不虚标（不制造假闸门）', async () => {
    const out = await propose({
      title: `${TAG} 全只读`,
      items: [{ title: '只读', toolName: 'compute_roi', needsGate: false }],
    });
    const html = render(out);
    expect(out.needsGateCount).toBe(0);
    expect(html).toContain('无需确认的步骤');
    expect(html).not.toContain('模型漏标');
  });

  it('计划卡不承接模型文本为 HTML（XSS 面）', async () => {
    const out = await propose({
      title: `${TAG} <script>alert(1)</script>`,
      items: [{ title: '<b>x</b>', needsGate: false }],
    });
    const html = render(out);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;');
  });
});
