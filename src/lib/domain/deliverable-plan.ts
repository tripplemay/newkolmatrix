// M3-B-DELIVERY F003 — 交付条件行生成规则（纯函数，P3）。
//
// Deal 创建时按 Quote 的交付物清单生成**五条**条件行（= V7 台账五列，
// architecture :472 明文一一对应）：
//   content / contract / escrow / ad_disclosure  恒必需（required=true，初态 pending）
//   key                                          视报价是否含 key 交付：
//                                                含 → required=true, pending
//                                                不含 → required=false, na（诚实语义：
//                                                       不适用，而不是「缺」——P3）
//
// 纯函数：不读 DB、无副作用。判定依据只有 Quote.deliverablesJson 的文本清单——
// **判错可人工纠正**：F008 的 `PATCH /api/delivery/deliverables/[id]` 可把 key 行
// 改 met/missing/na，人的核验永远优先于关键词猜测（D2：不猜，且留纠正入口）。

import type {
  DeliverableKind,
  DeliverableStatus,
} from './delivery-check';

export type { DeliverableKind, DeliverableStatus };

/**
 * key 交付的识别词表。
 * - 拉丁词用词边界匹配（`monkey` / `keyboard` 不得误命中）
 * - 中文按子串匹配（无词边界概念）
 * 词表是**保守**的：宁可漏判成 na 让人工改回，也不要把没约定 key 的合作凭空判成必需条件。
 */
export const KEY_DELIVERY_PATTERNS: readonly RegExp[] = [
  /\bkeys?\b/i, // key / keys
  /\bcd[-\s]?keys?\b/i, // cdkey / cd-key / cd key
  /\bgame\s?keys?\b/i, // game key
  /\bsteam\s?keys?\b/i, // steam key
  /激活码/,
  /兑换码/,
  /序列号/,
  /密钥/,
];

/** 报价交付物清单中是否约定了 key 交付。 */
export function includesKeyDelivery(
  deliverables: readonly string[] | null | undefined,
): boolean {
  if (deliverables == null) return false;
  return deliverables.some(
    (item) =>
      typeof item === 'string' &&
      KEY_DELIVERY_PATTERNS.some((re) => re.test(item)),
  );
}

export interface PlannedDeliverable {
  kind: DeliverableKind;
  required: boolean;
  status: DeliverableStatus;
}

/** 恒必需的四类条件（顺序 = V7 台账列序中除 key 外的部分）。 */
const ALWAYS_REQUIRED_KINDS: readonly DeliverableKind[] = [
  'content',
  'contract',
  'escrow',
  'ad_disclosure',
];

/**
 * 生成一个 Deal 的五条条件行（P3）。
 *
 * 纯函数：同输入必同输出；返回全新数组。输出恒五条且 kind 互不重复
 * （DB 侧 `@@unique([dealId, kind])` 的应用层前提）。
 */
export function planDeliverables(
  quoteDeliverables: readonly string[] | null | undefined,
): PlannedDeliverable[] {
  const hasKey = includesKeyDelivery(quoteDeliverables);
  return [
    { kind: 'content', required: true, status: 'pending' },
    hasKey
      ? { kind: 'key', required: true, status: 'pending' }
      : // 不适用：required=false + na —— V7 显示灰「—」，且不阻断 ready（F002）
        { kind: 'key', required: false, status: 'na' },
    ...ALWAYS_REQUIRED_KINDS.filter((k) => k !== 'content').map((kind) => ({
      kind,
      required: true,
      status: 'pending' as DeliverableStatus,
    })),
  ];
}
