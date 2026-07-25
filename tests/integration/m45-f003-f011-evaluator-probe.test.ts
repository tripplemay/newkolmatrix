// M4.5-AGENT-LOOP · Evaluator 独立探针（G3）— F003 compute_roi_portfolio / F011 check_compliance
//
// 本文件由 Evaluator 编写，**不复用 Generator 的夹具与断言**，目的是对 acceptance 逐条独立取证，
// 并补 Generator 测试未覆盖的对抗面：
//   - 跨租户越权（组合工具是否会把别的租户项目算进来 / 合规工具是否会泄露别租户项目）
//   - spend 口径的非 USD 排除 + 小数精度（不内联重算的真实判据：与装配层逐字相等）
//   - ctx.db（事务客户端）是否被真正尊重（绕过 ctx.db 直读全局 client = 事实源分裂）
//   - 溯源素材跨租户不可见时是否编造文件名
//   - 「本批只立工具不嵌入其他流程」的范围声明是否与实物一致
//
// 夹具命名统一带 `g3` + process.pid 前缀（本轮多 evaluator 并行，防互踩），afterAll 清理并核证零残留。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import {
  INSIGHT_ATTRIBUTION_CLAUSE,
  listPersonas,
} from '../../src/lib/agent/registry';
import type { ToolSet } from 'ai';
import { toAiSdkTools } from '../../src/lib/agent/to-ai-sdk-tools';
import { personaToolSubset } from '../../src/lib/agent/persona-router';
import { computeRoi } from '../../src/lib/domain/roi-compute';
import { attributionGaps } from '../../src/lib/domain/attribution-gaps';
import { loadTenantProjectSpends } from '../../src/lib/insight/metric-snapshot';
import type { ComputeRoiPortfolioOutput } from '../../src/lib/agent/tools/compute-roi-portfolio';
import type { CheckComplianceOutput } from '../../src/lib/agent/tools/check-compliance';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const TAG = `g3-${process.pid}`;

// ── 主租户（被测视角） ──
let tenantId: string;
let projMixed: string; // USD 100.55 payout + EUR 50 payout（非 USD 排除面）
let projBare: string; // 无任何金额
let insightCtx: ToolContext;
let complianceCtx: ToolContext;

// ── 邻居租户（越权面） ──
let otherTenantId: string;
let otherProjectId: string;
let otherMaterialId: string;

// ── 合规夹具 ──
let gameId: string;
let materialId: string;
let projRedline: string;
let projNoGame: string;
let headV2Id: string;

const V1 = `[${TAG}] v1 旧红线——被取代，不得出现`;
const V2 = `[${TAG}] v2 现行红线：#ad 披露须首屏可见`;

async function portfolio(
  input: Record<string, unknown>,
): Promise<ComputeRoiPortfolioOutput> {
  const r = await executeTool('compute_roi_portfolio', input, insightCtx);
  return r.output as ComputeRoiPortfolioOutput;
}

async function compliance(
  input: Record<string, unknown>,
): Promise<CheckComplianceOutput> {
  const r = await executeTool('check_compliance', input, complianceCtx);
  return r.output as CheckComplianceOutput;
}

async function payoutOn(
  projectId: string,
  amount: number,
  currency: string,
  seq: number,
) {
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `${TAG}-kol-${seq}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      termsJson: { amount } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: `${TAG}-payee-${seq}`,
            amount,
            currency,
            basis: 'evaluator 夹具',
            status: 'released',
          },
        ],
      },
    },
  });
}

beforeAll(async () => {
  getNativeToolNames();

  const t = await prisma.tenant.create({
    data: { slug: `evaltenant-${TAG}-main`, name: `G3 主租户 ${TAG}` },
  });
  tenantId = t.id;
  insightCtx = {
    tenantId,
    agentId: 'insight',
    projectId: null,
    env: 'default',
  };
  complianceCtx = {
    tenantId,
    agentId: 'compliance',
    projectId: null,
    env: 'default',
  };

  const other = await prisma.tenant.create({
    data: { slug: `evaltenant-${TAG}-other`, name: `G3 邻居租户 ${TAG}` },
  });
  otherTenantId = other.id;

  const mixed = await prisma.project.create({
    data: { tenantId, name: `${TAG} 混合币种项目` },
  });
  projMixed = mixed.id;
  const bare = await prisma.project.create({
    data: { tenantId, name: `${TAG} 无金额项目` },
  });
  projBare = bare.id;

  await payoutOn(projMixed, 100.55, 'USD', 1);
  await payoutOn(projMixed, 50, 'EUR', 2);

  // 邻居租户：一个项目 + 一份素材（跨租户可见性面）
  const otherProject = await prisma.project.create({
    data: { tenantId: otherTenantId, name: `${TAG} 邻居项目` },
  });
  otherProjectId = otherProject.id;
  const otherGame = await prisma.game.create({
    data: { tenantId: otherTenantId, name: `${TAG} 邻居游戏` },
  });
  const otherMaterial = await prisma.material.create({
    data: {
      tenantId: otherTenantId,
      gameId: otherGame.id,
      type: 'gameplay_doc',
      fileName: '邻居租户机密手册.pdf',
      storageRef: `${otherGame.id}/${TAG}-other.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 10,
    },
  });
  otherMaterialId = otherMaterial.id;

  // 合规夹具（主租户）
  const game = await prisma.game.create({
    data: { tenantId, name: `${TAG} 合规游戏` },
  });
  gameId = game.id;
  const material = await prisma.material.create({
    data: {
      tenantId,
      gameId,
      type: 'gameplay_doc',
      fileName: `${TAG}-合规手册.pdf`,
      storageRef: `${gameId}/${TAG}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 20,
    },
  });
  materialId = material.id;

  const v2 = await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'compliance_redline',
      content: V2,
      // 一条本租户素材 + 一条邻居租户素材（后者不可见 → fileName 应为 null，不得编名字）
      sourceMaterialIds: [material.id, otherMaterial.id],
      confidence: 0.5,
    },
  });
  headV2Id = v2.id;
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'compliance_redline',
      content: V1,
      sourceMaterialIds: [material.id],
      supersededById: v2.id,
    },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: `${TAG} 受众知识不得混入合规核查单`,
      sourceMaterialIds: [material.id],
    },
  });

  const pr = await prisma.project.create({
    data: {
      tenantId,
      name: `${TAG} 有红线项目`,
      gameId,
      slug: `${TAG}-redline`,
    },
  });
  projRedline = pr.id;
  const png = await prisma.project.create({
    data: { tenantId, name: `${TAG} 无游戏项目` },
  });
  projNoGame = png.id;
});

afterAll(async () => {
  for (const tid of [tenantId, otherTenantId]) {
    await prisma.payout.deleteMany({ where: { tenantId: tid } });
    await prisma.deal.deleteMany({ where: { tenantId: tid } });
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
    await prisma.gameKnowledge.deleteMany({ where: { tenantId: tid } });
    await prisma.material.deleteMany({ where: { tenantId: tid } });
    await prisma.operationLog.deleteMany({ where: { tenantId: tid } });
    await prisma.pendingAction.deleteMany({ where: { tenantId: tid } });
    await prisma.project.deleteMany({ where: { tenantId: tid } });
    await prisma.game.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  // 零残留核证
  const left = await prisma.tenant.count({
    where: { slug: { contains: TAG } },
  });
  if (left !== 0) throw new Error(`夹具残留未清理: ${left}`);
  await prisma.$disconnect();
});

describe('[F003] 注册 / 人格 / 闸门面（独立取证）', () => {
  it('registry 中 class=internal、source=native、无 buildHarm', () => {
    const def = getTool('compute_roi_portfolio')!;
    expect(def).toBeDefined();
    expect(def.class).toBe('internal');
    expect(def.source).toBe('native');
    expect(def.buildHarm).toBeUndefined();
    expect(getNativeToolNames()).toContain('compute_roi_portfolio');
  });

  it('人格绑定同源：只在 insight 的 tools 中，别的人格拿不到', () => {
    const owners = listPersonas()
      .filter((p) => p.tools.includes('compute_roi_portfolio'))
      .map((p) => p.id);
    expect(owners).toEqual(['insight']);
  });

  it('执行后零 PendingAction / 零 OperationLog（internal 不过闸门、不留副作用）', async () => {
    await portfolio({});
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(0);
  });
});

describe('[F003] 口径复用：与装配层/纯函数逐字相等（非内联重算）', () => {
  it('facts / roi / gaps 三者与直算完全一致（含非 USD 排除与小数精度）', async () => {
    const out = await portfolio({});
    const direct = await loadTenantProjectSpends({ tenantId });
    expect(out.projects.map((p) => p.projectId)).toEqual(
      direct.map((f) => f.projectId),
    );
    for (const row of out.projects) {
      const f = direct.find((x) => x.projectId === row.projectId)!;
      expect(row.facts).toEqual(f);
      expect(row.roi).toEqual(
        computeRoi({
          spend: f.spend,
          reach: f.reach,
          conversions: f.conversions,
          actualExposure: null,
          targetExposure: row.targetExposure,
        }),
      );
      expect(row.gaps).toEqual(
        attributionGaps({
          spend: f.spend,
          spendSource: f.spendSource,
          currency: f.currency,
          reach: f.reach,
          conversions: f.conversions,
        }),
      );
    }
  });

  it('非 USD 金额被如实排除、不换汇；小数分位不漂移', async () => {
    const out = await portfolio({ projectIds: [projMixed] });
    const row = out.projects[0];
    expect(row.facts.spend).toBe(100.55);
    expect(row.facts.currency).toBe('USD');
    expect(row.facts.spendSource).toBe('payout');
    expect(row.facts.nonUsdExcluded).toEqual([
      { currency: 'EUR', count: 1, amount: 50 },
    ]);
    expect(out.summary.totalSpend).toBe(100.55);
  });

  it('ctx.db（事务客户端）被尊重：事务内新建项目对本工具可见', async () => {
    const seen = await prisma.$transaction(async (tx) => {
      const tmp = await tx.project.create({
        data: { tenantId, name: `${TAG} 事务内项目` },
      });
      const r = await executeTool(
        'compute_roi_portfolio',
        {},
        { ...insightCtx, db: tx },
      );
      const o = r.output as ComputeRoiPortfolioOutput;
      return o.projects.some((p) => p.projectId === tmp.id);
    });
    expect(seen).toBe(true);
    // 事务已提交，清掉临时项目免污染后续断言
    await prisma.project.deleteMany({
      where: { tenantId, name: `${TAG} 事务内项目` },
    });
  });
});

describe('[F003] 诚实语义 + 越权面', () => {
  it('分子无回传源 → 每项目 roi=null / basis=insufficient_evidence，绝不用花费凑数', async () => {
    const out = await portfolio({});
    for (const p of out.projects) {
      expect(p.roi.roi).toBeNull();
      expect(p.roi.basis).toBe('insufficient_evidence');
      expect(p.gaps.gaps.length).toBeGreaterThan(0);
    }
    expect(out.summary.roiComputable).toBe(0);
    expect(out.summary.rankable).toBe(false);
    expect(out.summary.notRankableReason).toMatch(/证据|算不出/);
  });

  it('无任何金额的项目 spend=null（不填 0），口径 none', async () => {
    const out = await portfolio({ projectIds: [projBare] });
    expect(out.projects[0].facts.spend).toBeNull();
    expect(out.projects[0].facts.currency).toBeNull();
    expect(out.projects[0].facts.spendSource).toBe('none');
  });

  // 变异 M3 暴露的覆盖缺口（Generator 与本探针原都只在「至少一个项目有花费」的样本上断言
  // totalSpend）：全样本无真源时 summary.totalSpend 必须是 null 而非 0——
  // 「缺失」与「零」在 spend 口径上语义不同，填 0 会让模型把「没数据」读成「没花钱」。
  it('全样本无 spend 真源 → summary.totalSpend=null（缺失不得伪装成零）', async () => {
    const out = await portfolio({ projectIds: [projBare] });
    expect(out.summary.withSpend).toBe(0);
    expect(out.summary.totalSpend).toBeNull();
  });

  it('跨租户项目 id 不泄露：落 missingProjectIds，且不进 projects', async () => {
    const out = await portfolio({ projectIds: [projMixed, otherProjectId] });
    expect(out.projects.map((p) => p.projectId)).toEqual([projMixed]);
    expect(out.missingProjectIds).toEqual([otherProjectId]);
    expect(JSON.stringify(out)).not.toContain('邻居项目');
  });

  it('本租户全项目视图不含邻居租户项目', async () => {
    const out = await portfolio({});
    expect(out.scope).toBe('all');
    expect(out.projects.map((p) => p.projectId)).not.toContain(otherProjectId);
  });

  it('输出可序列化且往返无损（无 Decimal / Date 泄漏）', async () => {
    const out = await portfolio({});
    const round = JSON.parse(JSON.stringify(out));
    expect(round).toEqual(out);
    for (const p of out.projects) {
      if (p.facts.spend !== null) expect(typeof p.facts.spend).toBe('number');
    }
  });

  it('输入契约：空数组 = 全项目；非法元素被拒', async () => {
    const empty = await portfolio({ projectIds: [] });
    const nullish = await portfolio({});
    expect(empty.scope).toBe('all');
    expect(empty.projects.map((p) => p.projectId)).toEqual(
      nullish.projects.map((p) => p.projectId),
    );
    await expect(portfolio({ projectIds: [''] })).rejects.toThrow(
      /入参校验失败/,
    );
    await expect(portfolio({ projectIds: 'x' })).rejects.toThrow(
      /入参校验失败/,
    );
  });
});

describe('[F003] 洞察归因追问条款', () => {
  it('insight systemPrompt 含条款全文，且三条纪律锚点齐备', () => {
    const insight = listPersonas().find((p) => p.id === 'insight')!;
    expect(insight.systemPrompt).toContain(INSIGHT_ATTRIBUTION_CLAUSE);
    expect(INSIGHT_ATTRIBUTION_CLAUSE).toContain('证据不足就说证据不足');
    expect(INSIGHT_ATTRIBUTION_CLAUSE).toContain('不强行归因');
    expect(INSIGHT_ATTRIBUTION_CLAUSE).toContain('主动追问');
  });

  it('条款为人格专属，不污染其余 6 人格', () => {
    const withClause = listPersonas()
      .filter((p) => p.systemPrompt.includes(INSIGHT_ATTRIBUTION_CLAUSE))
      .map((p) => p.id);
    expect(withClause).toEqual(['insight']);
  });
});

describe('[F011] 注册 / 人格 / 闸门面（独立取证）', () => {
  it('registry 中 class=internal、source=native、无 buildHarm', () => {
    const def = getTool('check_compliance')!;
    expect(def).toBeDefined();
    expect(def.class).toBe('internal');
    expect(def.source).toBe('native');
    expect(def.buildHarm).toBeUndefined();
    expect(getNativeToolNames()).toContain('check_compliance');
  });

  it('compliance 人格 tools 由空数组变为含 check_compliance，且工具不外挂他人格', () => {
    const owners = listPersonas()
      .filter((p) => p.tools.includes('check_compliance'))
      .map((p) => p.id);
    expect(owners).toEqual(['compliance']);
    const c = listPersonas().find((p) => p.id === 'compliance')!;
    expect(c.tools).toEqual(['check_compliance']);
  });

  it('执行后零 PendingAction / 零 OperationLog', async () => {
    await compliance({ projectId: projRedline });
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(0);
  });
});

describe('[F011] 核查单：链头口径 + 溯源诚实', () => {
  it('只出现现行链头红线（v1 被取代不出现，他类知识不混入）', async () => {
    const out = await compliance({ projectId: projRedline });
    const contents = out.items.map((i) => i.content);
    expect(contents).toEqual([V2]);
    expect(JSON.stringify(out)).not.toContain(V1);
    expect(JSON.stringify(out)).not.toContain('受众知识');
    expect(out.items[0].knowledgeId).toBe(headV2Id);
  });

  it('溯源引用逐条给出；跨租户不可见素材 fileName=null（不编造文件名）', async () => {
    const out = await compliance({ projectId: projRedline });
    const sources = out.items[0].sources;
    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.materialId === materialId)!.fileName).toBe(
      `${TAG}-合规手册.pdf`,
    );
    expect(
      sources.find((s) => s.materialId === otherMaterialId)!.fileName,
    ).toBeNull();
    expect(JSON.stringify(out)).not.toContain('邻居租户机密手册');
    expect(out.items[0].unsourced).toBe(false);
  });

  it('恒不给判定：verdict=not_judged，note 明示原因；待查文案正文不回传', async () => {
    const secret = `${TAG}-机密文案-不得回传-日本語😀`;
    const out = await compliance({ projectId: projRedline, text: secret });
    expect(out.verdict).toBe('not_judged');
    expect(out.textProvided).toBe(true);
    expect(out.textLength).toBe(secret.length);
    expect(JSON.stringify(out)).not.toContain('机密文案');
    expect(out.note).toMatch(/不给合规判定|逐条比对/);
  });

  it('无游戏 → 空清单 + 「暂无红线知识」明示，绝不暗示合规通过', async () => {
    const out = await compliance({ projectId: projNoGame });
    expect(out.items).toEqual([]);
    expect(out.gameId).toBeNull();
    expect(out.note).toContain('暂无红线知识');
    expect(out.note).not.toContain('合规通过：');
    expect(out.note).toMatch(/不得据此判定/);
    expect(out.verdict).toBe('not_judged');
  });

  it('输入契约：slug 口径可用；跨租户项目一律拒绝（不返回空清单冒充无红线）', async () => {
    const bySlug = await compliance({ projectId: `${TAG}-redline` });
    expect(bySlug.projectId).toBe(projRedline);
    await expect(compliance({ projectId: otherProjectId })).rejects.toThrow(
      /项目不存在/,
    );
    await expect(compliance({ projectId: '' })).rejects.toThrow(/入参校验失败/);
  });

  it('输出 JSON 往返无损（无 Date 泄漏）', async () => {
    const out = await compliance({ projectId: projRedline });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('[F003/F011] 模型可达性：人格 ToolSet 里真的有这件工具（不只是名单里写了）', () => {
  // registry 声明 → personaToolSubset → toAiSdkTools 的桥接对未知工具名是**静默跳过**
  //（to-ai-sdk-tools.ts:41 `if (!def) continue`）。故「人格 tools 数组里有这个名字」
  // 不等于「模型真能调到」——这里按 loop.ts 的真实装配路径再验一次可达性与隔离。
  function toolSetFor(agentId: 'insight' | 'compliance'): ToolSet {
    const persona = listPersonas().find((p) => p.id === agentId)!;
    return toAiSdkTools(personaToolSubset(persona), {
      tenantId,
      agentId,
      projectId: null,
      env: 'default',
    });
  }

  /** AI SDK 的 execute 选项类型在测试里无关紧要（工具实现不读它），窄化到调用形态即可。 */
  function callTool(set: ToolSet, name: string, input: unknown) {
    const exec = set[name].execute as unknown as (
      i: unknown,
      o: unknown,
    ) => Promise<unknown>;
    return exec(input, { toolCallId: 'probe-g3', messages: [] });
  }

  it('insight ToolSet 含 compute_roi_portfolio 且经 executeTool 真跑出组合结果', async () => {
    const set = toolSetFor('insight');
    expect(Object.keys(set)).toContain('compute_roi_portfolio');
    expect(Object.keys(set)).not.toContain('check_compliance'); // 人格隔离
    const out = (await callTool(
      set,
      'compute_roi_portfolio',
      {},
    )) as ComputeRoiPortfolioOutput;
    expect(out.projects.length).toBeGreaterThan(0);
    expect(out.summary.rankable).toBe(false);
  });

  it('compliance ToolSet 含 check_compliance 且经 executeTool 真跑出核查单', async () => {
    const set = toolSetFor('compliance');
    expect(Object.keys(set)).toContain('check_compliance');
    expect(Object.keys(set)).not.toContain('compute_roi_portfolio'); // 人格隔离
    const out = (await callTool(set, 'check_compliance', {
      projectId: projRedline,
    })) as CheckComplianceOutput;
    expect(out.items.map((i) => i.content)).toEqual([V2]);
    expect(out.verdict).toBe('not_judged');
  });
});

describe('[F011] 范围声明与实物一致：本批只立工具，不嵌入其他流程', () => {
  it('产品代码中除装配入口/人格名册外，无任何流程调用 check_compliance', () => {
    const files = [
      'src/lib/agent/tools/create-share-link.ts',
      'src/lib/agent/tools/draft-report.ts',
      'src/lib/agent/tools/email-drafting.ts',
      'src/lib/agent/tools/propose-plan.ts',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('check_compliance');
      expect(src, f).not.toContain('checkCompliance');
    }
  });
});
