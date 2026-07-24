// M3-B-DELIVERY F002 — 交付条件核对纯函数（架构口径的 `deliveryCheck.row` = 本文件 `checkDeliveryRow`）。
//
// 输入 = 一个 Deal + 它的 Deliverable 行（调用方查好后结构化传入），
// 输出 = 五条件各自的展示三态 + `ready`（全部**必需**条件 met）+ 缺口清单。
// 纯函数：不读 DB、不打网关、无副作用、不 import prisma client——可被单测穷举
// （crm-infer / env-guards / match-score 先例，D7 形态：kebab-case 文件名 + 具名导出）。
//
// **三处复用铁律（architecture :535 · F002 acceptance 5）：**
// ① V7 条件台账页面（F009 接真：`ready` 决定 🚪 放款红 gate 是否出现）
// ② `check_deliverables` 内部工具（F007：输出即本函数产物，不得内联重算）
// ③ `payout` 服务端二次校验（F005：buildHarm 与 execute **各重跑一次**，前端渲染了按钮
//    也拒——FR-8.2.4.2「无绕过入口」的服务端实现，P6）
// 三处必须复用本函数——单一真相源。UI 与服务端不得各判一次（P5）。
//
// ── 判定规则（spec §3 P3/P5/P6）──
//
// 单元三态（V7 §2.3 硬要求：ok 绿 / miss 琥珀 / na 灰，**不得压成二态**）：
//   status=met                    → ok（齐）
//   status=missing                → miss（缺）
//   status=na                     → na（不适用，如无 key 交付的合作）
//   status=pending + required     → miss（未开始 = 尚未满足，对放款判定等价于缺）
//   status=pending + !required    → na（非必需且未开始 → 显示「不适用」而非「缺」：
//                                      避免催人去补一个本就不需要的条件，D2 诚实语义）
//   条件行缺失（五类未建全）      → miss + 缺口 ROW_ABSENT（fail-safe，见下）
//
// `ready`（= 放款按钮渲染与服务端硬闸的同一真相）：
//   所有 required=true 的条件 status === 'met'，**且** Deal 不处于 blocked / defaulted。
//   - `na` 行不计入（required=false 的 na 是正常合作形态，不阻断放款）
//   - required=true 但 status='na' 视为数据异常 → **阻断**（NA_BUT_REQUIRED）
//   - 条件行整类缺失 → **阻断**（ROW_ABSENT）
//   fail-safe 方向恒为「拒付」：资金闸门宁可挡住合法放款让人补数据，不可因数据缺失放行（P1/P6）。
//
// ── Signal 为何不在入参（architecture :535 写的是「Deal + Deliverables + 相关信号」）──
//
// 本批交付证据来自 `Deliverable.evidenceRef` 人工登记（P4：合同/托管在外部真实完成，系统登记引用）；
// `Signal` 表当前只承载 `email_delivery_status` / `manual_override` 两类（schema.prisma :454），
// 与交付条件无关。接真平台回调（稿件发布 / 托管到账）时再把信号并入入参——
// 那是 EXTENSION POINT，本批不预测形状、不留空转字段（D2 不猜）。

/** 交付条件五类（与 Prisma enum `DeliverableKind` 字面量逐字一致；本地定义保持 domain 层零依赖）。 */
export type DeliverableKind =
  | 'content'
  | 'key'
  | 'contract'
  | 'escrow'
  | 'ad_disclosure';

/** 交付条件四态（与 Prisma enum `DeliverableStatus` 一致）。 */
export type DeliverableStatus = 'pending' | 'met' | 'missing' | 'na';

/** Deal 七态（与 Prisma enum `DealStatus` 一致）。 */
export type DealStatus =
  | 'negotiating'
  | 'signed'
  | 'escrowed'
  | 'delivering'
  | 'completed'
  | 'blocked'
  | 'defaulted';

/** 展示三态（V7 台账 .cond ok/miss/na；🔒 na 不得并入 miss 压成二态）。 */
export type DeliveryCondition = 'ok' | 'miss' | 'na';

/** 五条件的规范序 = V7 台账列序（内容 / Key / 合同 / 托管 / #ad）。 */
export const DELIVERABLE_KINDS = [
  'content',
  'key',
  'contract',
  'escrow',
  'ad_disclosure',
] as const;

/** 缺口原因码（字符串字面量联合，EnvGuardReason / IgnoredOverrideReason 先例——调用方要分支渲染「缺什么显什么」，自由文本不可分支）。 */
export type DeliveryGapReason =
  /** 已核验为缺（status=missing） */
  | 'MISSING'
  /** 未开始 / 未核验（status=pending） */
  | 'PENDING'
  /** 标记不适用但该条件必需——数据异常，fail-safe 阻断 */
  | 'NA_BUT_REQUIRED'
  /** 该类条件行整条缺失（Deal 未建全五行）——fail-safe 阻断 */
  | 'ROW_ABSENT'
  /** Deal 处于 blocked（争议 / 暂停），不论条件是否齐一律不可放款 */
  | 'DEAL_BLOCKED'
  /** Deal 已 defaulted（违约终态），不可放款 */
  | 'DEAL_DEFAULTED';

/** 单条件核对结果（V7 一个条件单元的完整渲染依据）。 */
export interface DeliveryConditionCell {
  kind: DeliverableKind;
  /** 展示三态（V7 §2.3） */
  cell: DeliveryCondition;
  /** 库内原始四态；条件行缺失时为 null（与「有行且是 pending」可区分） */
  status: DeliverableStatus | null;
  /** 是否必需（false 的行不参与 ready 判定）；条件行缺失时按 fail-safe 记 true */
  required: boolean;
  /** 证据引用（稿件链接 / 披露截图 / 单号），无则 null（D2：不填 '' 冒充） */
  evidenceRef: string | null;
  /** 附注（V7 🔒 note 条件渲染的数据源），无则 null */
  note: string | null;
}

/** 缺口条目（调用方据此渲染「缺什么显什么」/ payout 拒绝原因）。 */
export interface DeliveryGap {
  /** 与哪个条件相关；Deal 级缺口（blocked / defaulted）为 null */
  kind: DeliverableKind | null;
  reason: DeliveryGapReason;
  /** 该条件行的附注（供展示补充说明），无则 null */
  note: string | null;
}

/** `checkDeliveryRow` 入参：一个 Deal 的两类事实，调用方查好传入（函数不读 DB）。 */
export interface DeliveryCheckInput {
  deal: {
    id: string;
    status: DealStatus;
  };
  deliverables: readonly {
    kind: DeliverableKind;
    status: DeliverableStatus;
    required: boolean;
    evidenceRef?: string | null;
    note?: string | null;
  }[];
}

/** `checkDeliveryRow` 返回：五条件单元 + ready + 缺口清单。 */
export interface DeliveryCheckResult {
  dealId: string;
  dealStatus: DealStatus;
  /** 恒五条，按 `DELIVERABLE_KINDS` 序（台账列序稳定，调用方不必自行排序） */
  conditions: DeliveryConditionCell[];
  /** 同上，按 kind 索引（服务端校验按类取用更直接） */
  byKind: Record<DeliverableKind, DeliveryConditionCell>;
  /** 全部必需条件 met 且 Deal 不在 blocked/defaulted —— 放款按钮与服务端硬闸的同一真相 */
  ready: boolean;
  /** 缺口清单（ready=true 时恒为空数组） */
  gaps: DeliveryGap[];
}

/** Deal 级不可放款的状态（fail-safe：条件再齐也不放）。 */
const NON_PAYABLE_DEAL_STATUS: Partial<Record<DealStatus, DeliveryGapReason>> = {
  blocked: 'DEAL_BLOCKED',
  defaulted: 'DEAL_DEFAULTED',
};

/** 四态 → 展示三态（pending 的落点取决于 required，见文件头规则表）。 */
export function conditionCellOf(
  status: DeliverableStatus,
  required: boolean,
): DeliveryCondition {
  if (status === 'met') return 'ok';
  if (status === 'na') return 'na';
  if (status === 'missing') return 'miss';
  // pending：必需 → 尚未满足按「缺」显示；非必需 → 「不适用」
  return required ? 'miss' : 'na';
}

/**
 * 交付条件核对（文件头注释 = 完整规则）。
 *
 * 纯函数：不修改入参、无 IO、同输入必同输出；返回全新对象。
 * 同一 kind 出现多行时取输入序首条（DB 侧有 `@@unique([dealId, kind])` 保证不会发生，
 * 此处的确定性只是防御——不因输入顺序产生摇摆结论）。
 */
export function checkDeliveryRow(
  input: DeliveryCheckInput,
): DeliveryCheckResult {
  const seen = new Map<DeliverableKind, DeliveryCheckInput['deliverables'][number]>();
  for (const row of input.deliverables) {
    if (!seen.has(row.kind)) seen.set(row.kind, row);
  }

  const conditions: DeliveryConditionCell[] = [];
  const gaps: DeliveryGap[] = [];

  for (const kind of DELIVERABLE_KINDS) {
    const row = seen.get(kind);

    if (row == null) {
      // 条件行缺失 = 数据不全，不是「没有这个条件」——fail-safe 记必需且阻断
      conditions.push({
        kind,
        cell: 'miss',
        status: null,
        required: true,
        evidenceRef: null,
        note: null,
      });
      gaps.push({ kind, reason: 'ROW_ABSENT', note: null });
      continue;
    }

    const note = row.note ?? null;
    conditions.push({
      kind,
      cell: conditionCellOf(row.status, row.required),
      status: row.status,
      required: row.required,
      evidenceRef: row.evidenceRef ?? null,
      note,
    });

    if (!row.required || row.status === 'met') continue;

    // 必需但未 met —— 三种缺口形态各自可分支
    const reason: DeliveryGapReason =
      row.status === 'missing'
        ? 'MISSING'
        : row.status === 'na'
          ? 'NA_BUT_REQUIRED'
          : 'PENDING';
    gaps.push({ kind, reason, note });
  }

  const dealGapReason = NON_PAYABLE_DEAL_STATUS[input.deal.status];
  if (dealGapReason != null) {
    gaps.push({ kind: null, reason: dealGapReason, note: null });
  }

  const byKind = {} as Record<DeliverableKind, DeliveryConditionCell>;
  for (const cell of conditions) byKind[cell.kind] = cell;

  return {
    dealId: input.deal.id,
    dealStatus: input.deal.status,
    conditions,
    byKind,
    ready: gaps.length === 0,
    gaps,
  };
}
