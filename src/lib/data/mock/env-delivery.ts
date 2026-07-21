// ARCH-M05 F011 — Delivery 条件台账 mock（原型 interaction-prototype-v2.html LEDGER L588-594 逐字移植）
//
// 服务 V7 条件台账（11 元素）。5 行齐缺组合覆盖条件三态（🔒 不得压成二态）：
//   ok（齐）全行均有 · miss（缺）见 龙猫玩家.contract / ArkPlays.content+ad / DeepWoods.escrow ·
//   na（不适用）见 ArkPlays.key。ready=true 仅 2/5（MeepleMax / SurviveKing）→ 🚪 放款红 gate。
// D2 渲染契约：缺失字段一律 null（无附注 → note: null），绝不填 '' / 0 冒充实测。
// 反向 guardrail（D8）：本环节 mock 刻意不含 KPI / 图表 / 推荐 / 批量字段，不得补。

/** 条件单元三态（原型 .cond ok/miss/na，🔒 na 不得并入 miss 压成二态） */
export type DeliveryCondition = 'ok' | 'miss' | 'na';

export interface DeliveryLedgerRow {
  id: string;
  /** 创作者名（纯色方块 av 取首二字） */
  who: string;
  /** 🔒 纯色方块 av 底色（原型 r.av 逐行指定纯色，非 AVC 色轮） */
  av: string;
  /** 交付物 */
  sub: string;
  /** 🔒 附注（条件渲染「 · {note}」；无附注 → null，D2） */
  note: string | null;
  content: DeliveryCondition;
  key: DeliveryCondition;
  contract: DeliveryCondition;
  escrow: DeliveryCondition;
  ad: DeliveryCondition;
  /** 放款金额（右对齐 · 字重 800） */
  pay: string;
  /** 条件是否全部齐备（true → 🚪 放款红 gate；false → 🔒「条件未齐」灰字替代按钮位） */
  ready: boolean;
}

// 原型 LEDGER（L588-594）：文案 / 色值 / 齐缺组合逐字移植。
export const mockDeliveryLedger: DeliveryLedgerRow[] = [
  {
    id: 'meeplemax',
    who: 'MeepleMax',
    sub: '抢先体验实况',
    av: '#01b574',
    note: null,
    content: 'ok',
    key: 'ok',
    contract: 'ok',
    escrow: 'ok',
    ad: 'ok',
    pay: '$1,600',
    ready: true,
  },
  {
    id: 'longmao',
    who: '龙猫玩家',
    sub: '愿望单导流视频',
    av: '#3965ff',
    note: '合同待补签',
    content: 'ok',
    key: 'ok',
    contract: 'miss',
    escrow: 'ok',
    ad: 'ok',
    pay: '$1,400',
    ready: false,
  },
  {
    id: 'arkplays',
    who: 'ArkPlays',
    sub: '生存教程系列',
    av: '#ffb547',
    note: '终稿未交 · 缺 #ad',
    content: 'miss',
    key: 'na',
    contract: 'ok',
    escrow: 'ok',
    ad: 'miss',
    pay: '$1,200',
    ready: false,
  },
  {
    id: 'surviveking',
    who: 'SurviveKing',
    sub: 'Boss 速通短视频',
    av: '#7551ff',
    note: null,
    content: 'ok',
    key: 'ok',
    contract: 'ok',
    escrow: 'ok',
    ad: 'ok',
    pay: '$900',
    ready: true,
  },
  {
    id: 'deepwoods',
    who: 'DeepWoods',
    sub: '建造流长视频',
    av: '#ee5d50',
    note: '托管未到账',
    content: 'ok',
    key: 'ok',
    contract: 'ok',
    escrow: 'miss',
    ad: 'ok',
    pay: '$1,100',
    ready: false,
  },
];
