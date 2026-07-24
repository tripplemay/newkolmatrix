// M4-INSIGHT F005 — compute_roi 工具集成测试
//
// 覆盖 acceptance：
// - 注册且挂 insight 人格（同源断言）；class=internal 无 buildHarm（直调不产生 PendingAction）
// - 输出 = roi.compute + attribution.gaps 产物（与纯函数直算逐字相等——不内联重算）
// - 分子缺 → roi=null + basis=insufficient_evidence + gaps 非空（诚实透传，不在工具层伪造）
// - 目标值接线：Project.goal.targetExposure → exposure.target；actualExposure 恒 null → 方向 null
// - 输出可序列化（JSON 往返无损，供画布渲染）
// - 输入契约：坏入参被拒；项目不存在明示抛错

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { computeRoi } from '../../src/lib/domain/roi-compute';
import { attributionGaps } from '../../src/lib/domain/attribution-gaps';
import { loadProjectSpend } from '../../src/lib/insight/metric-snapshot';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { ComputeRoiToolOutput } from '../../src/lib/agent/tools/compute-roi';

const FIXTURE_SLUG = `test-tenant-m4-roitool-${process.pid}`;
const TARGET_EXPOSURE = 3_000_000;

let tenantId: string;
let projWithGoal: string; // goal + released payout
let projEmpty: string; // 无 goal 无金额源
let ctx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 compute-roi 夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };

  const p1 = await prisma.project.create({
    data: {
      tenantId,
      name: 'ROI 夹具项目',
      goal: {
        targetExposure: TARGET_EXPOSURE,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      } as unknown as Prisma.InputJsonValue,
    },
  });
  projWithGoal = p1.id;
  const p2 = await prisma.project.create({
    data: { tenantId, name: 'ROI 空态项目' },
  });
  projEmpty = p2.id;

  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `roitool-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: projWithGoal,
      kolId: kol.id,
      termsJson: { amount: 900 } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'RoiKol',
            amount: 900,
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
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格', () => {
  it('compute_roi 已注册、class=internal、无 buildHarm', () => {
    const tool = getTool('compute_roi');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('internal');
    expect(tool?.buildHarm).toBeUndefined();
  });

  it('insight 人格声明 compute_roi，且声明的每个工具名真实存在于注册表（同源断言）', () => {
    const insight = listPersonas().find((p) => p.id === 'insight');
    expect(insight?.tools).toContain('compute_roi');
    for (const name of insight?.tools ?? []) {
      expect(getTool(name), `insight 人格声明的工具 ${name} 未注册`).toBeTruthy();
    }
  });
});

describe('输出 = 纯函数产物（不内联重算）', () => {
  it('roi/gaps 与纯函数直算逐字相等；spend 真源 + 目标接线', async () => {
    const result = await executeTool(
      'compute_roi',
      { projectId: projWithGoal },
      ctx,
    );
    const out = result.output as ComputeRoiToolOutput;

    const facts = await loadProjectSpend(projWithGoal, { tenantId });
    const expectedRoi = computeRoi({
      spend: facts.spend,
      reach: facts.reach,
      conversions: facts.conversions,
      actualExposure: null,
      targetExposure: TARGET_EXPOSURE,
    });
    const expectedGaps = attributionGaps({
      spend: facts.spend,
      spendSource: facts.spendSource,
      currency: facts.currency,
      reach: facts.reach,
      conversions: facts.conversions,
    });

    expect(out.roi).toEqual(expectedRoi);
    expect(out.gaps).toEqual(expectedGaps);
    expect(out.facts).toEqual(facts);
    expect(out.facts.spend).toBe(900);
    expect(out.facts.spendSource).toBe('payout');
    expect(out.targetExposure).toBe(TARGET_EXPOSURE);
    expect(out.roi.exposure.target).toBe(TARGET_EXPOSURE);
  });

  it('分子缺 → roi=null + insufficient_evidence + gaps 非空（诚实透传）；方向为 null 不冒充 flat', async () => {
    const result = await executeTool(
      'compute_roi',
      { projectId: projWithGoal },
      ctx,
    );
    const out = result.output as ComputeRoiToolOutput;
    expect(out.roi.roi).toBeNull(); // 本批 reach/conversions/actualExposure 恒无源
    expect(out.roi.basis).toBe('insufficient_evidence');
    expect(out.gaps.gaps.length).toBeGreaterThan(0);
    expect(out.roi.exposure.direction).toBeNull(); // actual 缺 → 无法判断 ≠ flat
  });

  it('空态项目：spend=null + 源 none + 缺口含 SPEND_ABSENT（不填 0）', async () => {
    const result = await executeTool(
      'compute_roi',
      { projectId: projEmpty },
      ctx,
    );
    const out = result.output as ComputeRoiToolOutput;
    expect(out.facts.spend).toBeNull();
    expect(out.facts.spendSource).toBe('none');
    expect(out.targetExposure).toBeNull(); // 无 goal 如实透传
    expect(out.gaps.gaps.map((g) => g.reason)).toContain('SPEND_ABSENT');
  });
});

describe('闸门与序列化', () => {
  it('internal 直调不产生 PendingAction；输出 JSON 往返无损（供画布渲染）', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const result = await executeTool(
      'compute_roi',
      { projectId: projWithGoal },
      ctx,
    );
    const after = await prisma.pendingAction.count({ where: { tenantId } });
    expect(after).toBe(before);

    const roundTrip = JSON.parse(JSON.stringify(result.output));
    expect(roundTrip).toEqual(result.output);
  });
});

describe('输入契约', () => {
  it('缺 projectId → zod 拒绝', async () => {
    await expect(executeTool('compute_roi', {}, ctx)).rejects.toThrow(
      '入参校验失败',
    );
  });

  it('项目不存在 → 明示抛错（不静默返回空）', async () => {
    await expect(
      executeTool('compute_roi', { projectId: 'nonexistent' }, ctx),
    ).rejects.toThrow('项目不存在');
  });
});
