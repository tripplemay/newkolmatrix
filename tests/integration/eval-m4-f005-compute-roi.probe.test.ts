// [EVALUATOR 独立验收产物 · M4-INSIGHT F005] compute_roi 真库独立探针（非 Generator 测试）
//
// 只覆盖 Generator 测试未走到的分支与边界，逐条对齐 F005 acceptance：
//   ① 注册 + insight 人格（含 persona router 收窄后的实际可用子集，不只看 registry 数组）
//   ② class=internal 无 buildHarm → executeTool 不落 PendingAction、不签票
//   ③ 诚实透传：committed quote 弱证据分支（SPEND_COMMITTED_ONLY + 承诺额事实）
//   ④ 非 USD 排除清单透传 + 输出无 Prisma.Decimal 泄漏（JSON 往返无损）
//   ⑤ 租户隔离：他租户项目 → 明示抛错，不跨租户出数
//   ⑥ 输入契约边界：空串 / 非字符串 / 多余键
//
// 零外呼：compute_roi 不打网关（本文件不引 lib/ai/gateway 任何调用路径）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { getPersona } from '../../src/lib/agent/registry';
import { personaToolSubset } from '../../src/lib/agent/persona-router';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { ComputeRoiToolOutput } from '../../src/lib/agent/tools/compute-roi';

const SLUG_A = `test-tenant-m4-f005probe-a-${process.pid}`;
const SLUG_B = `test-tenant-m4-f005probe-b-${process.pid}`;

let tenantA: string;
let tenantB: string;
let projQuoteOnly: string; // 仅 committed quote（USD 900 + JPY 50000 非 USD 行）
let ctxA: ToolContext;
let ctxB: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const a = await prisma.tenant.create({
    data: { slug: SLUG_A, name: 'F005 探针租户 A' },
  });
  const b = await prisma.tenant.create({
    data: { slug: SLUG_B, name: 'F005 探针租户 B' },
  });
  tenantA = a.id;
  tenantB = b.id;
  ctxA = { tenantId: tenantA, agentId: 'insight', projectId: null, env: 'default' };
  ctxB = { tenantId: tenantB, agentId: 'insight', projectId: null, env: 'default' };

  const p = await prisma.project.create({
    data: { tenantId: tenantA, name: 'F005 承诺额项目' },
  });
  projQuoteOnly = p.id;

  const kol = await prisma.kol.create({
    data: { tenantId: tenantA, canonicalHandle: `f005probe-kol-${process.pid}` },
  });
  const thread = await prisma.outreachThread.create({
    data: { tenantId: tenantA, projectId: projQuoteOnly, kolId: kol.id },
  });
  await prisma.quote.createMany({
    data: [
      {
        tenantId: tenantA,
        threadId: thread.id,
        amount: '1200.50',
        currency: 'USD',
        deliverablesJson: {} as unknown as Prisma.InputJsonValue,
        status: 'committed',
      },
      {
        tenantId: tenantA,
        threadId: thread.id,
        amount: '50000.00',
        currency: 'JPY',
        deliverablesJson: {} as unknown as Prisma.InputJsonValue,
        status: 'committed',
      },
    ],
  });
});

afterAll(async () => {
  for (const t of [tenantA, tenantB]) {
    await prisma.pendingAction.deleteMany({ where: { tenantId: t } });
    await prisma.operationLog.deleteMany({ where: { tenantId: t } });
    await prisma.project.deleteMany({ where: { tenantId: t } });
    await prisma.kol.deleteMany({ where: { tenantId: t } });
    await prisma.tenant.deleteMany({ where: { id: t } });
  }
  await prisma.$disconnect();
});

describe('① 注册 + insight 人格（含 router 实际收窄）', () => {
  it('compute_roi 在注册表；insight registry 数组含之；router 收窄后仍可用', () => {
    const tool = getTool('compute_roi');
    expect(tool?.name).toBe('compute_roi');
    expect(tool?.source).toBe('native');

    const insight = getPersona('insight');
    expect(insight.tools).toContain('compute_roi');
    // 人格 → 运行时可用子集（route 真正下发给模型的那一份）
    expect(personaToolSubset(insight)).toContain('compute_roi');
    // 同源：人格声明的每个工具名都真实注册（防声明漂移）
    for (const n of insight.tools) {
      expect(getTool(n), `insight 声明的 ${n} 未注册`).toBeTruthy();
    }
    // 反向：compute_roi 不应挂到其它人格（洞察域专属，越界即漂移）
    for (const id of ['orchestrator', 'strategy', 'match', 'reach', 'delivery', 'compliance'] as const) {
      expect(getPersona(id).tools).not.toContain('compute_roi');
    }
  });

  it('class=internal 且 buildHarm 未声明（只读，不进闸门分支）', () => {
    const tool = getTool('compute_roi');
    expect(tool?.class).toBe('internal');
    expect(tool?.buildHarm).toBeUndefined();
  });
});

describe('② 只读语义：不落 PendingAction / 不写业务表', () => {
  it('执行前后 PendingAction / OperationLog / MetricSnapshot 计数不变', async () => {
    const before = await Promise.all([
      prisma.pendingAction.count({ where: { tenantId: tenantA } }),
      prisma.operationLog.count({ where: { tenantId: tenantA } }),
      prisma.metricSnapshot.count({ where: { tenantId: tenantA } }),
    ]);
    await executeTool('compute_roi', { projectId: projQuoteOnly }, ctxA);
    const after = await Promise.all([
      prisma.pendingAction.count({ where: { tenantId: tenantA } }),
      prisma.operationLog.count({ where: { tenantId: tenantA } }),
      prisma.metricSnapshot.count({ where: { tenantId: tenantA } }),
    ]);
    expect(after).toEqual(before);
  });
});

describe('③④ 诚实透传：committed quote 弱证据 + 非 USD 排除 + 序列化', () => {
  it('quote 源 → SPEND_COMMITTED_ONLY 带承诺额；roi=null insufficient_evidence；不与 SPEND_ABSENT 混为一码', async () => {
    const { output } = await executeTool(
      'compute_roi',
      { projectId: projQuoteOnly },
      ctxA,
    );
    const out = output as ComputeRoiToolOutput;

    expect(out.facts.spendSource).toBe('quote');
    expect(out.facts.spend).toBe(1200.5); // 仅 USD 行计入，JPY 不换汇
    expect(out.facts.currency).toBe('USD');
    expect(out.facts.nonUsdExcluded).toEqual([
      { currency: 'JPY', count: 1, amount: 50000 },
    ]);

    const reasons = out.gaps.gaps.map((g) => g.reason);
    expect(reasons).toContain('SPEND_COMMITTED_ONLY');
    expect(reasons).not.toContain('SPEND_ABSENT');
    expect(reasons).toContain('REACH_ABSENT');
    expect(reasons).toContain('CONVERSIONS_ABSENT');
    expect(out.gaps.byMetric.spend?.committed).toEqual({
      amount: 1200.5,
      currency: 'USD',
    });
    expect(out.gaps.complete).toBe(false);

    expect(out.roi.roi).toBeNull();
    expect(out.roi.basis).toBe('insufficient_evidence');
    expect(out.targetExposure).toBeNull(); // 无 goal → 如实 null
    expect(out.roi.exposure.direction).toBeNull();
  });

  it('输出无 Decimal / Date 泄漏：全部为 JSON 原生类型，往返无损', async () => {
    const { output } = await executeTool(
      'compute_roi',
      { projectId: projQuoteOnly },
      ctxA,
    );
    const out = output as ComputeRoiToolOutput;
    expect(typeof out.facts.spend).toBe('number'); // Decimal 已转 number
    expect(typeof out.gaps.byMetric.spend?.committed?.amount).toBe('number');

    const json = JSON.stringify(output);
    expect(JSON.parse(json)).toEqual(output); // 往返无损（供画布渲染）
    // 排查隐藏的类实例（Decimal / Date 会在此暴露为对象/字符串不一致）
    const walk = (v: unknown): void => {
      if (v === null || typeof v !== 'object') return;
      expect(
        Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype,
        '输出含非纯对象（类实例）→ 序列化不可靠',
      ).toBe(true);
      for (const x of Object.values(v as Record<string, unknown>)) walk(x);
    };
    walk(output);
  });
});

describe('⑤ 租户隔离', () => {
  it('他租户项目 id → 明示抛「项目不存在」，不跨租户出数', async () => {
    await expect(
      executeTool('compute_roi', { projectId: projQuoteOnly }, ctxB),
    ).rejects.toThrow('项目不存在');
  });
});

describe('⑥ 输入契约边界', () => {
  it('空串 projectId → zod 拒绝（min(1)）', async () => {
    await expect(
      executeTool('compute_roi', { projectId: '' }, ctxA),
    ).rejects.toThrow('入参校验失败');
  });

  it('非字符串 projectId → zod 拒绝', async () => {
    await expect(
      executeTool('compute_roi', { projectId: 123 }, ctxA),
    ).rejects.toThrow('入参校验失败');
  });

  it('多余键被剥离，不影响执行（模型多塞字段不炸）', async () => {
    const { output } = await executeTool(
      'compute_roi',
      { projectId: projQuoteOnly, bogus: 'x', roi: 999 },
      ctxA,
    );
    const out = output as ComputeRoiToolOutput;
    expect(out.projectId).toBe(projQuoteOnly);
    expect(out.roi.roi).toBeNull(); // 外部塞的 roi=999 不得污染输出
  });
});
