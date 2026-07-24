// M3-B-DELIVERY F009 — V7 交付台账显示契约（RSC 组装 → 可序列化视图；沿 reach-format 先例）
//
// mock `env-delivery.ts` 退役后，行视图类型与纯色方块 av 色板迁居此处（原型逐字沿用）。
// 条件三态 ok/miss/na 的**判定**不在这里——它是 `domain/delivery-check.ts` 的产物
//（三处复用铁律 ①：页面渲染的 ready 与 payout 服务端硬闸是同一次判定口径）。
// 本文件只做「真值 → 展示串」的机械映射。

import type { DeliveryCondition } from 'lib/domain/delivery-check';

export type { DeliveryCondition };

/**
 * V7 台账一行（原型 LEDGER L588-594 字段逐字对应）。
 * 全字段可序列化（server→client prop 硬要求）。
 */
export interface DeliveryLedgerRow {
  /** = Deal.id（放款闸门以此发起） */
  id: string;
  /** 创作者名（纯色方块 av 取首二字） */
  who: string;
  /** 🔒 纯色方块 av 底色（原型 r.av 逐行指定纯色，**非** ProjectAvatar 色轮） */
  av: string;
  /** 交付物（条款快照 deliverables 合并；缺 → 「—」，D2 不编） */
  sub: string;
  /** 🔒 附注（条件渲染「 · {note}」；无附注 → null，D2） */
  note: string | null;
  content: DeliveryCondition;
  key: DeliveryCondition;
  contract: DeliveryCondition;
  escrow: DeliveryCondition;
  ad: DeliveryCondition;
  /** 放款金额展示串（右对齐 · 字重 800）；条款缺金额 → 「—」 */
  pay: string;
  /** 条件是否全部齐备（true → 🚪 放款红 gate；false → 🔒「条件未齐」灰字替代按钮位） */
  ready: boolean;
  /** 已放款（Payout released 真值；原 mock 的本地 paidIds 态由服务端接管） */
  paid: boolean;
}

export interface DeliverySurfaceData {
  rows: DeliveryLedgerRow[];
}

/** 空态（项目未命中 / 组装失败 → 渲染空表而非抛错，D2）。 */
export const EMPTY_DELIVERY_SURFACE: DeliverySurfaceData = { rows: [] };

/**
 * 🔒 纯色方块 av 色板（原型五行逐字色值）。真数据行数不固定，故按 kolId 稳定散列取色——
 * 同一创作者恒定同色（刷新不跳色），且**不是** ProjectAvatar 的色轮（V7 明文区别于 V6）。
 */
export const LEDGER_AV_COLORS = [
  '#01b574',
  '#3965ff',
  '#ffb547',
  '#7551ff',
  '#ee5d50',
] as const;

export function ledgerAvColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LEDGER_AV_COLORS[h % LEDGER_AV_COLORS.length];
}

/** 金额展示串（原型 `$1,600` 形态）。缺金额/币种 → 「—」（D2：不填 0 冒充）。 */
export function formatPayout(
  amount: number | null,
  currency: string | null,
): string {
  if (amount == null || !currency) return '—';
  const num = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${num}` : `${num} ${currency}`;
}

/** V7 台账空态文案（夹具 / 新项目：还没有交易）。数据源语义与 →delivery 守卫判据一致。 */
export const DELIVERY_EMPTY_TEXT =
  '还没有交易——报价经确认后自动生成交付条件台账';
