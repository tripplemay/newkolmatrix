// M4-INSIGHT F006 — draft_report 工具 + WeeklyReport 起草/采纳集成测试
//
// 覆盖 acceptance：
// - draft_report 注册且挂 insight 人格（同源断言）；class=internal 无 buildHarm（直调不产生 PendingAction）
// - 经注入缝 mock LLM 起草 → WeeklyReport 落库（draftContent 非空 / adopted=false / projectId 区分 scope P10）
// - 事实段 = F004 装配 + F003 gaps + F002 roi 产物（prompt 含真实事实与「证据不足」，不内联编造）
// - 同周期重入覆盖策略（未采纳覆盖 / 已采纳冻结跳过）
// - 采纳幂等（重复采纳不改写 adoptedAt）；采纳是 internal（无 PendingAction）
// - 无凭据降级固定草案明示（不静默）；工具输出可序列化（JSON 往返无损）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  adoptWeeklyReport,
  draftWeeklyReport,
  isoWeekPeriod,
  type ReportLlmCaller,
} from '../../src/lib/insight/weekly-report';

const FIXTURE_SLUG = `test-tenant-m4-report-${process.pid}`;

let tenantId: string;
let projWithSpend: string;
let ctx: ToolContext;

// 各用例独立周期，互不耦合
const PERIOD_Q = '2030-W10';
const PERIOD_P = '2030-W11';
const PERIOD_ADOPT = '2030-W12';
const PERIOD_FROZEN = '2030-W13';
const PERIOD_TOOL = '2030-W14';

let captured: { system: string; prompt: string } | null = null;
const mockLlm: ReportLlmCaller = async (input) => {
  captured = input;
  return '本周草案正文（mock LLM 产物）';
};

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 draft-report 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: '料理次元夹具' },
  });
  projWithSpend = p.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };

  // spend 真源：released USD payout（经 Deal 归属项目）
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `report-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: projWithSpend,
      kolId: kol.id,
      termsJson: { amount: 1200 } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'ReportKol',
            amount: 1200.5,
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
  await prisma.weeklyReport.deleteMany({ where: { tenantId } }); // projectId=null 行不随 project 级联，显式清
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格', () => {
  it('draft_report 已注册、class=internal、无 buildHarm', () => {
    const tool = getTool('draft_report');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('internal');
    expect(tool?.buildHarm).toBeUndefined();
  });

  it('insight 人格声明 draft_report，且人格声明的每个工具名真实存在于注册表（同源断言）', () => {
    const insight = listPersonas().find((p) => p.id === 'insight');
    expect(insight?.tools).toContain('draft_report');
    for (const name of insight?.tools ?? []) {
      expect(getTool(name), `insight 人格声明的工具 ${name} 未注册`).toBeTruthy();
    }
  });
});

describe('起草落库（P10 双态）', () => {
  it('projectId=null → 跨项目周报落库；prompt 含真实事实与 ROI 证据不足（不编造）', async () => {
    captured = null;
    const r = await draftWeeklyReport(
      { projectId: null, period: PERIOD_Q },
      { tenantId },
      mockLlm,
    );
    expect(r.degraded).toBe(false);
    expect(r.projectId).toBeNull();
    expect(r.adopted).toBe(false);
    expect(r.draftContent).toBe('本周草案正文（mock LLM 产物）');

    const row = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r.reportId },
    });
    expect(row.projectId).toBeNull();
    expect(row.period).toBe(PERIOD_Q);
    expect(row.adopted).toBe(false);
    expect(row.draftContent.length).toBeGreaterThan(0);
    expect(row.generatedBy).toBe('insight');

    // 事实段：F004 spend 真值 + F002 roi 诚实降级 + F003 缺口，全部进 prompt
    expect(captured?.prompt).toContain('<FACTS>');
    expect(captured?.prompt).toContain('料理次元夹具');
    expect(captured?.prompt).toContain('1200.50');
    expect(captured?.prompt).toContain('已放款');
    expect(captured?.prompt).toContain('证据不足');
    expect(captured?.prompt).toContain('缺口');
    // 诚实铁律进 system
    expect(captured?.system).toContain('绝不编造');
  });

  it('projectId=非空 → 项目级复盘落库（scope 区分）', async () => {
    const r = await draftWeeklyReport(
      { projectId: projWithSpend, period: PERIOD_P },
      { tenantId },
      mockLlm,
    );
    const row = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r.reportId },
    });
    expect(row.projectId).toBe(projWithSpend);
    expect(row.period).toBe(PERIOD_P);
  });
});

describe('同周期重入（覆盖策略）', () => {
  it('未采纳同周期草案 → 覆盖同一行，不堆重复行', async () => {
    const first = await draftWeeklyReport(
      { projectId: null, period: PERIOD_FROZEN },
      { tenantId },
      async () => '第一版草案',
    );
    const second = await draftWeeklyReport(
      { projectId: null, period: PERIOD_FROZEN },
      { tenantId },
      async () => '第二版草案',
    );
    expect(second.reportId).toBe(first.reportId);
    expect(second.draftContent).toBe('第二版草案');
    const count = await prisma.weeklyReport.count({
      where: { tenantId, projectId: null, period: PERIOD_FROZEN },
    });
    expect(count).toBe(1);
  });

  it('已采纳 → 冻结跳过（skippedAdopted=true，内容不被覆盖）', async () => {
    const r = await draftWeeklyReport(
      { projectId: null, period: PERIOD_FROZEN },
      { tenantId },
      async () => '第三版草案（不应落库）',
    );
    await adoptWeeklyReport(r.reportId, { tenantId });
    const after = await draftWeeklyReport(
      { projectId: null, period: PERIOD_FROZEN },
      { tenantId },
      async () => '第四版草案（不应落库）',
    );
    expect(after.skippedAdopted).toBe(true);
    expect(after.reportId).toBe(r.reportId);
    const row = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r.reportId },
    });
    expect(row.draftContent).toBe('第三版草案（不应落库）');
  });
});

describe('采纳（P5 internal + 幂等）', () => {
  it('采纳置 adopted=true + adoptedAt；重复采纳不改写 adoptedAt；全程无 PendingAction', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const r = await draftWeeklyReport(
      { projectId: projWithSpend, period: PERIOD_ADOPT },
      { tenantId },
      mockLlm,
    );
    const first = await adoptWeeklyReport(r.reportId, { tenantId });
    expect(first.alreadyAdopted).toBe(false);
    expect(first.adoptedAt).toBeInstanceOf(Date);

    const second = await adoptWeeklyReport(r.reportId, { tenantId });
    expect(second.alreadyAdopted).toBe(true);
    expect(second.adoptedAt.getTime()).toBe(first.adoptedAt.getTime());

    const after = await prisma.pendingAction.count({ where: { tenantId } });
    expect(after).toBe(before); // internal：采纳与起草都不过闸门
  });

  it('采纳不存在的报告 → 明示抛错（不静默）', async () => {
    await expect(
      adoptWeeklyReport('nonexistent-id', { tenantId }),
    ).rejects.toThrow('采纳失败');
  });
});

describe('无凭据降级（明示，不静默）+ 工具直调', () => {
  it('AIGCGATEWAY_* 缺失时默认路径降级固定草案：首行明示 + 仍含库内真实事实', async () => {
    const saved = {
      base: process.env.AIGCGATEWAY_BASE_URL,
      key: process.env.AIGCGATEWAY_API_KEY,
    };
    delete process.env.AIGCGATEWAY_BASE_URL;
    delete process.env.AIGCGATEWAY_API_KEY;
    try {
      const r = await draftWeeklyReport(
        { projectId: null, period: PERIOD_TOOL },
        { tenantId },
      );
      expect(r.degraded).toBe(true);
      expect(r.draftContent.startsWith('【降级草案】')).toBe(true);
      expect(r.draftContent).toContain('料理次元夹具'); // 固定草案仍基于真实事实
      expect(r.draftContent).toContain('证据不足');
    } finally {
      if (saved.base != null) process.env.AIGCGATEWAY_BASE_URL = saved.base;
      if (saved.key != null) process.env.AIGCGATEWAY_API_KEY = saved.key;
    }
  });

  it('executeTool 直调：不产生 PendingAction，输出可序列化（JSON 往返无损）', async () => {
    const saved = {
      base: process.env.AIGCGATEWAY_BASE_URL,
      key: process.env.AIGCGATEWAY_API_KEY,
    };
    delete process.env.AIGCGATEWAY_BASE_URL;
    delete process.env.AIGCGATEWAY_API_KEY;
    try {
      const before = await prisma.pendingAction.count({ where: { tenantId } });
      const result = await executeTool(
        'draft_report',
        { period: PERIOD_TOOL },
        ctx,
      );
      const after = await prisma.pendingAction.count({ where: { tenantId } });
      expect(after).toBe(before);

      const roundTrip = JSON.parse(JSON.stringify(result.output));
      expect(roundTrip).toEqual(result.output);
      expect(roundTrip.period).toBe(PERIOD_TOOL);
      expect(roundTrip.adopted).toBe(false);
    } finally {
      if (saved.base != null) process.env.AIGCGATEWAY_BASE_URL = saved.base;
      if (saved.key != null) process.env.AIGCGATEWAY_API_KEY = saved.key;
    }
  });

  it('入参契约：坏 period 被拒', async () => {
    await expect(
      executeTool('draft_report', { period: 'not-a-week' }, ctx),
    ).rejects.toThrow('入参校验失败');
  });
});

describe('isoWeekPeriod', () => {
  it('格式 YYYY-Www；1 月 4 日恒属第 1 周（ISO 8601）', () => {
    expect(isoWeekPeriod(new Date())).toMatch(/^\d{4}-W\d{2}$/);
    expect(isoWeekPeriod(new Date(Date.UTC(2026, 0, 4)))).toBe('2026-W01');
    expect(isoWeekPeriod(new Date(Date.UTC(2030, 0, 4)))).toBe('2030-W01');
  });
});
