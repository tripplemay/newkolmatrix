// M3-B-DELIVERY F007 — delivery 内部工具：track_delivery / check_deliverables（internal/native）
//
// class:'internal'（只读，不过闸门、无 buildHarm）——两者都不产生任何对外副作用。
//
// **三处复用铁律 ②（domain/delivery-check.ts 文件头）**：`check_deliverables` 的输出
// **就是** `checkDeliveryRow` 的产物（经 `lib/delivery/check.ts` 装配壳），本文件内
// 不内联重算任何条件判定——Agent 嘴里的「齐/缺」与台账渲染的、与 payout 服务端硬闸的，
// 永远是同一个函数的同一次判定口径（DP-6 推论：不会出现「画布一个数、Agent 嘴里另一个数」）。

import { z } from 'zod';
import {
  describeGaps,
  loadDeliveryCheck,
  loadProjectDeliveryChecks,
  type LoadedDeliveryRow,
} from 'lib/delivery/check';
import type { DeliveryCheckResult } from 'lib/domain/delivery-check';
import type { ToolContext, ToolDefinition } from './types';

// ───────────────────────── 可序列化产物（供画布渲染）─────────────────────────

/** 一行交付快照（JSON 可序列化：无 Date / Decimal / class 实例）。 */
export interface DeliverySnapshotRow {
  dealId: string;
  kolId: string;
  who: string;
  dealStatus: string;
  amount: number | null;
  currency: string | null;
  deliverables: string[];
  contractRef: string | null;
  escrowRef: string | null;
  /** 五条件单元（ok/miss/na 三态，顺序 = V7 台账列序） */
  conditions: DeliveryCheckResult['conditions'];
  ready: boolean;
  gaps: DeliveryCheckResult['gaps'];
  /** 缺口一行摘要（「缺什么显什么」，与拒绝原因同一套文案） */
  gapSummary: string;
}

function toSnapshot(row: LoadedDeliveryRow): DeliverySnapshotRow {
  return {
    dealId: row.dealId,
    kolId: row.kolId,
    who: row.who,
    dealStatus: row.status,
    amount: row.terms.amount,
    currency: row.terms.currency,
    deliverables: row.terms.deliverables,
    contractRef: row.contractRef,
    escrowRef: row.escrowRef,
    conditions: row.check.conditions,
    ready: row.check.ready,
    gaps: row.check.gaps,
    gapSummary: describeGaps(row.check),
  };
}

// ───────────────────────── track_delivery ─────────────────────────

const trackInputSchema = z.object({
  projectId: z.string().min(1).describe('项目 id'),
  dealId: z
    .string()
    .optional()
    .describe('只看某一笔交易时填（缺省 = 该项目全部交易）'),
});

type TrackDeliveryInput = z.infer<typeof trackInputSchema>;

export interface TrackDeliveryOutput {
  projectId: string;
  /** 交易数（rows.length 的显式副本，供 Agent 直接引用不必自行数） */
  total: number;
  /** 可放款（条件全齐）的行数 */
  readyCount: number;
  rows: DeliverySnapshotRow[];
}

async function runTrack(
  input: TrackDeliveryInput,
  ctx: ToolContext,
): Promise<TrackDeliveryOutput> {
  const loadCtx = { tenantId: ctx.tenantId, db: ctx.db };
  let rows: LoadedDeliveryRow[];
  if (input.dealId) {
    const one = await loadDeliveryCheck(input.dealId, loadCtx);
    // 越权保护：dealId 与 projectId 不匹配时按「无此交易」处理，不泄漏他项目数据
    rows = one && one.projectId === input.projectId ? [one] : [];
  } else {
    rows = await loadProjectDeliveryChecks(input.projectId, loadCtx);
  }
  const snapshots = rows.map(toSnapshot);
  return {
    projectId: input.projectId,
    total: snapshots.length,
    readyCount: snapshots.filter((r) => r.ready).length,
    rows: snapshots,
  };
}

export const trackDeliveryTool: ToolDefinition<
  TrackDeliveryInput,
  TrackDeliveryOutput
> = {
  name: 'track_delivery',
  description:
    '查看项目的交付台账：每笔交易的条件核对快照（内容/Key/合同/托管/#ad 三态）、是否可放款、缺口清单。只读，不执行任何动作。',
  class: 'internal',
  source: 'native',
  inputSchema: trackInputSchema,
  execute: runTrack,
};

// ───────────────────────── check_deliverables ─────────────────────────

const checkInputSchema = z.object({
  dealId: z.string().min(1).describe('交易 Deal.id'),
});

type CheckDeliverablesInput = z.infer<typeof checkInputSchema>;

export interface CheckDeliverablesOutput {
  found: boolean;
  /** 单笔交付快照（deliveryCheck 产物，非本工具重算）；不存在时 null */
  row: DeliverySnapshotRow | null;
}

async function runCheck(
  input: CheckDeliverablesInput,
  ctx: ToolContext,
): Promise<CheckDeliverablesOutput> {
  const row = await loadDeliveryCheck(input.dealId, {
    tenantId: ctx.tenantId,
    db: ctx.db,
  });
  if (row == null) return { found: false, row: null };
  return { found: true, row: toSnapshot(row) };
}

export const checkDeliverablesTool: ToolDefinition<
  CheckDeliverablesInput,
  CheckDeliverablesOutput
> = {
  name: 'check_deliverables',
  description:
    '核对一笔交易的交付条件：每个条件齐/缺/不适用、是否满足放款前置、缺口逐条列出。与台账页面和放款服务端校验同一判定函数。只读。',
  class: 'internal',
  source: 'native',
  inputSchema: checkInputSchema,
  execute: runCheck,
};
