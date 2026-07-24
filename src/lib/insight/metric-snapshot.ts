// M4-INSIGHT F004 — MetricSnapshot 装配服务（spend 真源聚合，有 DB；沿 delivery/check.ts 装配壳先例）。
//
// P3 口径（spec §3）：按 projectId 聚合 spend——
//   有 released Payout → sum(payout.amount) + spendSource='payout'
//   无 released 有 committed Quote → sum(quote.amount) + spendSource='quote'
//   两者皆无 → spend=null + spendSource='none'
// **仅 USD 计入**（非 USD 不换汇，沿 M3-A budgetUsd 口径）：非 USD 行不进 sum、
// 按币种如实登记在 `nonUsdExcluded`（缺口语义由 attribution.gaps 承载，不在此处下结论）。
// 有源但 USD 口径无值（全非 USD）→ spend=null 且 spendSource 仍标真源——
// 与「无源」（spendSource='none'）语义可区分（P1 诚实降级：绝不用 0 冒充「没有数」）。
//
// reach / conversions / roi **恒 null**（M5 真回传源接入前无分子；P1 铁律：绝不填 0 / 不猜 ROI）。
// ROI 判定与缺口清单不在本文件——那是 domain/roi-compute.ts / domain/attribution-gaps.ts
// 两个纯函数的职责（三处复用铁律），本文件只做「加载事实」这一步。
//
// 取数方式（P3 不焊死）：本批 on-read 装配为主（loadProjectSpend / loadTenantProjectSpends）；
// MetricSnapshot 表为 M5 快照持久化预留，persistMetricSnapshot 是最小写入口。
//
// 金额精度：Payout.amount / Quote.amount 是 Decimal(14,2)——聚合按「分」整数累加
// （Decimal.toNumber() 后 ×100 取整），避免浮点串加的精度漂移。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';

export interface InsightLoadCtx {
  tenantId: string;
  /** 事务客户端（事务内一致快照读取路径传入；缺省用全局 client）。 */
  db?: Prisma.TransactionClient;
}

/** spend 口径标注（与 MetricSnapshot.spendSource 列取值一致）。 */
export type SpendSource = 'payout' | 'quote' | 'none';

/** 被排除在 USD 口径之外的非 USD 金额（如实登记，不换汇、不下结论）。 */
export interface NonUsdExclusion {
  currency: string;
  count: number;
  /** 该币种原币金额合计（仅登记用；不与 USD 相加） */
  amount: number;
}

/** 一个项目的度量装配结果（V8 / compute_roi / weekly-draft 的共同事实底座）。 */
export interface ProjectMetricFacts {
  projectId: string;
  /** USD 口径聚合金额；无源或有源但无 USD 行 → null（与 0 语义可区分） */
  spend: number | null;
  /** spend 非 null 时恒 'USD'；null 时为 null（D2：不填 '' 冒充） */
  currency: string | null;
  spendSource: SpendSource;
  /** 非 USD 排除清单（空数组 = 无排除） */
  nonUsdExcluded: NonUsdExclusion[];
  /** M5 真回传源接入前恒 null（P1：绝不填 0） */
  reach: null;
  /** 同上 */
  conversions: null;
  /** 分子缺 → 恒 null；ROI 判定归 domain/roi-compute.ts，本层不算 */
  roi: null;
}

interface MoneyRow {
  projectId: string;
  currency: string;
  /** 分（整数） */
  cents: number;
}

/** Decimal → 分（整数）。Decimal(14,2) 值域内安全。 */
function toCents(amount: Prisma.Decimal): number {
  return Math.round(amount.toNumber() * 100);
}

/** 按项目分组做 USD 口径聚合（core：payout 行与 quote 行同一算法）。 */
function aggregateByProject(
  projectIds: readonly string[],
  rowsBySource: { payout: MoneyRow[]; quote: MoneyRow[] },
): Map<string, ProjectMetricFacts> {
  const out = new Map<string, ProjectMetricFacts>();

  for (const projectId of projectIds) {
    const payoutRows = rowsBySource.payout.filter((r) => r.projectId === projectId);
    const quoteRows = rowsBySource.quote.filter((r) => r.projectId === projectId);

    // 真源优先级：released payout（实际放款）＞ committed quote（承诺额）＞ 无
    const source: SpendSource =
      payoutRows.length > 0 ? 'payout' : quoteRows.length > 0 ? 'quote' : 'none';
    const rows = source === 'payout' ? payoutRows : source === 'quote' ? quoteRows : [];

    let usdCents: number | null = null;
    const excluded = new Map<string, { count: number; cents: number }>();
    for (const row of rows) {
      if (row.currency === 'USD') {
        usdCents = (usdCents ?? 0) + row.cents;
      } else {
        const prev = excluded.get(row.currency) ?? { count: 0, cents: 0 };
        excluded.set(row.currency, {
          count: prev.count + 1,
          cents: prev.cents + row.cents,
        });
      }
    }

    const spend = usdCents == null ? null : usdCents / 100;
    out.set(projectId, {
      projectId,
      spend,
      currency: spend == null ? null : 'USD',
      spendSource: source,
      nonUsdExcluded: [...excluded.entries()]
        .map(([currency, v]) => ({
          currency,
          count: v.count,
          amount: v.cents / 100,
        }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      reach: null,
      conversions: null,
      roi: null,
    });
  }

  return out;
}

/** 拉取租户内（可选限定项目）的真源金额行。released payout 经 Deal 归属项目，committed quote 经 Thread。 */
async function loadMoneyRows(
  ctx: InsightLoadCtx,
  projectId?: string,
): Promise<{ payout: MoneyRow[]; quote: MoneyRow[] }> {
  const db = ctx.db ?? prisma;

  const payouts = await db.payout.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'released',
      deal: projectId ? { projectId } : undefined,
    },
    select: {
      amount: true,
      currency: true,
      deal: { select: { projectId: true } },
    },
  });

  const quotes = await db.quote.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'committed',
      thread: projectId ? { projectId } : undefined,
    },
    select: {
      amount: true,
      currency: true,
      thread: { select: { projectId: true } },
    },
  });

  return {
    payout: payouts.map((p) => ({
      projectId: p.deal.projectId,
      currency: p.currency,
      cents: toCents(p.amount),
    })),
    quote: quotes.map((q) => ({
      projectId: q.thread.projectId,
      currency: q.currency,
      cents: toCents(q.amount),
    })),
  };
}

/** 单项目度量装配（V8 对照账本 / compute_roi 的事实来源）。项目不存在时仍返回空态事实（源=none）。 */
export async function loadProjectSpend(
  projectId: string,
  ctx: InsightLoadCtx,
): Promise<ProjectMetricFacts> {
  const rows = await loadMoneyRows(ctx, projectId);
  const facts = aggregateByProject([projectId], rows).get(projectId);
  // aggregateByProject 对传入的每个 id 必产出一条；此断言只为类型收窄
  if (!facts) throw new Error(`unreachable: no facts for ${projectId}`);
  return facts;
}

/** 跨项目度量装配（V12 洞察页 / weekly-draft 例程）：租户全项目按项目分组，createdAt 升序稳定。 */
export async function loadTenantProjectSpends(
  ctx: InsightLoadCtx,
): Promise<ProjectMetricFacts[]> {
  const db = ctx.db ?? prisma;
  const projects = await db.project.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const ids = projects.map((p) => p.id);
  const rows = await loadMoneyRows(ctx);
  const byProject = aggregateByProject(ids, rows);
  return ids.map((id) => byProject.get(id)!);
}

/**
 * MetricSnapshot 表写入口（最小实装，M5 快照持久化预留）。
 * 装配当下事实并落一行快照；reach/conversions/roi 恒 null（P1）。
 * date 缺省取当前时刻（快照时刻语义，spec §4）。
 */
export async function persistMetricSnapshot(
  projectId: string,
  ctx: InsightLoadCtx,
  date: Date = new Date(),
): Promise<{ id: string; facts: ProjectMetricFacts }> {
  const db = ctx.db ?? prisma;
  const facts = await loadProjectSpend(projectId, ctx);
  const row = await db.metricSnapshot.create({
    data: {
      tenantId: ctx.tenantId,
      projectId,
      date,
      spend: facts.spend,
      currency: facts.currency,
      spendSource: facts.spendSource,
      reach: null,
      conversions: null,
      roi: null,
    },
    select: { id: true },
  });
  return { id: row.id, facts };
}
