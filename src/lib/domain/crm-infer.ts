// M3-A-REACH-CRM F005 — CRM 五态推断纯函数（架构口径的 `crmInfer.status` = 本文件 `inferCrmStatus`）。
//
// 输入 = 一个 OutreachThread 的 messages + signals + quotes（调用方查好后结构化传入），
// 输出 = 五态推断结果 + 被忽略的越权覆盖留痕信息。纯函数：不读 DB、不打网关、无副作用、
// 不 import prisma client——可被单测穷举（env-guards / match-score 先例，D7 形态：
// kebab-case 文件名 + 具名导出）。
//
// **三处复用铁律（architecture :533 同款 · F005 acceptance 5）：**
// ① V6 页面五态 pill（F008 ConversationInbox 接真）
// ② reach 工具层（F003 send_outreach 状态推进 / F006 commit_quote）
// ③ signals 例程（F004 webhook 重算管道 / F009 manual_override 入口）
// 三处必须复用本函数——单一真相源，任何调用方不得各自内联实现推断。
// OutreachThread.status 列只是本函数结果的物化缓存（schema.prisma :353 注释同口径）。
//
// ── 推断规则（spec §2 U4 / §3 P2 / architecture :491 五态）──
//
// 事件面地板（库内实物 → 状态下限，取「最靠后」者）：
//   基线 pending_send
//   存在 direction=sent 消息            → ≥ sent
//   存在 direction=inbound 消息
//     或 type=email_reply 信号          → ≥ replied（本批真入站不接（P2），但函数按事件语义
//                                          推断、不感知来源限制——M3-B 接真入站时零改动）
//   存在任一 Quote 行                   → ≥ negotiating（rejected 也蕴含「曾进入谈判」：
//                                          Quote 流转 proposed→committed/rejected，行的存在
//                                          即证明报价发生过）
//   存在 status=committed 的 Quote      → confirmed（U4：唯一路径，必经 commit_quote 闸门）
//
// 注意：type=email_delivery_status 信号（delivered/bounced/opened/complained，F004 webhook）
// **不推进** CRM 状态——投递状态 ≠ 回复。
//
// ── manual_override 合成规则（U4 有限覆盖，设计定夺见下）──
//
// Signal(type=manual_override, payload:{status}) 仅可断言 sent / replied / negotiating 三态。
// 多条 override 取 detectedAt 最新的**合法**一条；越权/非法条目视同不存在（但全部留痕）。
// 合成取「更靠后的状态」：final = max(事件面推断, override 断言)。理由：
//   1. 事件面全部对应库内实物（OutreachMessage 行 / Quote 行），override 断言更早的状态
//      无法抹除已发生的事实——允许降级会让五态 pill 与库内数据互相矛盾；
//   2. override 的存在意义（P2）恰是补足事件面看不见的进展：真入站缺位时，
//      人工标「已回复 / 谈判中」把状态**向前**推——降级不是它的职责，
//      数据录错走数据修正（删/改错误记录），不走 override。
//
// ── 越权覆盖留痕（acceptance 3）──
//
// override 断言 confirmed（U4 明令禁止）→ 忽略该条，并在返回值 `ignoredOverrides` 中携带
// reason='CONFIRMED_NOT_OVERRIDABLE'——供调用方（F004 管道 / F009 入口）写 OperationLog 留痕。
// 本函数保持纯函数，只暴露信息，不亲自写日志。

/** CRM 五态（与 Prisma enum `ReachStatus` 字面量逐字一致；本地定义以保持 domain 层零依赖）。 */
export type ReachStatus =
  | 'pending_send'
  | 'sent'
  | 'replied'
  | 'negotiating'
  | 'confirmed';

/** 消息方向（与 Prisma enum `MessageDirection` 字面量一致）。 */
export type CrmMessageDirection = 'draft' | 'sent' | 'inbound';

/** 报价状态（与 Prisma enum `QuoteStatus` 字面量一致）。 */
export type CrmQuoteStatus = 'proposed' | 'committed' | 'rejected';

/** 五态进度序（推断 = 取各事件地板与合法 override 中「最靠后」者的依据）。 */
export const REACH_STATUS_ORDER = [
  'pending_send',
  'sent',
  'replied',
  'negotiating',
  'confirmed',
] as const;

/** U4 有限覆盖：manual_override 仅可断言这三态。confirmed 不在其中（唯一路径 = quote.committed）。 */
export const OVERRIDABLE_STATUSES = ['sent', 'replied', 'negotiating'] as const;

export type OverridableReachStatus = (typeof OVERRIDABLE_STATUSES)[number];

/** 人工覆盖信号的 type 取值（F009 写入口 / 本函数识别，同一常量防字符串漂移）。 */
export const MANUAL_OVERRIDE_SIGNAL_TYPE = 'manual_override';

/**
 * 真入站回复信号的 type 取值。本批不产生此类信号（P2：真入站归 M3-B+），
 * 常量先立在这里使推断规则前向兼容——接真入站时信号写这个 type 即自动推 replied。
 */
export const EMAIL_REPLY_SIGNAL_TYPE = 'email_reply';

/** 消息输入：推断只依赖方向。调用方 select 最小列集即可。 */
export interface CrmMessageInput {
  direction: CrmMessageDirection;
}

/** 报价输入：推断只依赖状态。 */
export interface CrmQuoteInput {
  status: CrmQuoteStatus;
}

/**
 * 信号输入。`payload` = Signal.payloadJson 原样传入（unknown：jsonb 无编译期形状，
 * 函数内做窄化校验，提不出合法断言即按非法留痕——不信任外部数据）。
 */
export interface CrmSignalInput {
  id: string;
  type: string;
  detectedAt: Date;
  payload: unknown;
}

/** `inferCrmStatus` 入参：一个 thread 的三类事实，调用方查好传入（函数不读 DB）。 */
export interface CrmInferContext {
  messages: readonly CrmMessageInput[];
  signals: readonly CrmSignalInput[];
  quotes: readonly CrmQuoteInput[];
}

/**
 * override 被忽略的理由（字符串字面量联合，EnvGuardReason 先例——
 * 调用方要在 OperationLog / 展示层做分支，自由文本不可分支）。
 */
export type IgnoredOverrideReason =
  /** U4 越权：断言 confirmed。confirmed 唯一路径 = commit_quote 闸门（acceptance 3 的留痕点） */
  | 'CONFIRMED_NOT_OVERRIDABLE'
  /** 断言了合法五态之一但不在 U4 三态白名单内（即 pending_send） */
  | 'STATUS_NOT_OVERRIDABLE'
  /** payload 缺 status / status 非字符串 / 不是五态之一——形状不合法 */
  | 'MALFORMED_OVERRIDE';

/** 被忽略的越权/非法 override——调用方（F004 管道 / F009 入口）据此写 OperationLog 留痕。 */
export interface IgnoredOverride {
  signalId: string;
  /** 原样保留的断言值（payload 形状不合法提不出字符串时为 null） */
  asserted: string | null;
  reason: IgnoredOverrideReason;
  detectedAt: Date;
}

/** 生效候选的 override（detectedAt 最新的合法一条）。 */
export interface AppliedOverride {
  signalId: string;
  asserted: OverridableReachStatus;
  detectedAt: Date;
  /** true = 该断言把状态推进到了事件面之外（final status 由它决定）；false = 被事件面事实追平/超过 */
  effective: boolean;
}

/** `inferCrmStatus` 返回：最终五态 + 事件面推断 + override 合成明细 + 越权留痕。 */
export interface CrmInferResult {
  /** 最终推断（= max(eventStatus, 合法 override 断言)），OutreachThread.status 的物化来源 */
  status: ReachStatus;
  /** 仅事件面（messages/quotes/回复信号）的推断，不含 override——供审计与展示分辨来源 */
  eventStatus: ReachStatus;
  /** 参与合成的 override（detectedAt 最新的合法一条）；无合法 override 时为 null */
  override: AppliedOverride | null;
  /** 被忽略的越权/非法 override（acceptance 3：调用方必须据此留痕，不得静默丢弃） */
  ignoredOverrides: IgnoredOverride[];
}

/** 五态进度序号。非法取值返回 -1（防御：不把未知值当基线放行）。 */
export function reachStatusIndex(status: ReachStatus): number {
  return REACH_STATUS_ORDER.indexOf(status);
}

/**
 * 事件面推断：从高地板往低检查，命中即返回（等价于取各地板的 max）。
 * 顺序即五态进度序的倒序——confirmed 判定必须最先（唯一路径语义不容被低地板短路）。
 */
function inferEventStatus(ctx: CrmInferContext): ReachStatus {
  if (ctx.quotes.some((q) => q.status === 'committed')) return 'confirmed';
  if (ctx.quotes.length > 0) return 'negotiating';
  const hasReply =
    ctx.messages.some((m) => m.direction === 'inbound') ||
    ctx.signals.some((s) => s.type === EMAIL_REPLY_SIGNAL_TYPE);
  if (hasReply) return 'replied';
  if (ctx.messages.some((m) => m.direction === 'sent')) return 'sent';
  return 'pending_send';
}

type ParsedOverride =
  | { ok: true; asserted: OverridableReachStatus }
  | { ok: false; asserted: string | null; reason: IgnoredOverrideReason };

/** 窄化 manual_override 的 payload。任何提不出合法三态断言的形状都归入被忽略（fail-safe）。 */
function parseOverridePayload(payload: unknown): ParsedOverride {
  if (typeof payload !== 'object' || payload == null) {
    return { ok: false, asserted: null, reason: 'MALFORMED_OVERRIDE' };
  }
  const status = (payload as Record<string, unknown>).status;
  if (typeof status !== 'string') {
    return { ok: false, asserted: null, reason: 'MALFORMED_OVERRIDE' };
  }
  if (status === 'confirmed') {
    // U4 越权：专属 reason，调用方留痕与验收断言都以此字面量定位
    return { ok: false, asserted: status, reason: 'CONFIRMED_NOT_OVERRIDABLE' };
  }
  if ((OVERRIDABLE_STATUSES as readonly string[]).includes(status)) {
    return { ok: true, asserted: status as OverridableReachStatus };
  }
  if ((REACH_STATUS_ORDER as readonly string[]).includes(status)) {
    // 合法五态但不在 U4 白名单（即 pending_send）——与形状非法可区分
    return { ok: false, asserted: status, reason: 'STATUS_NOT_OVERRIDABLE' };
  }
  return { ok: false, asserted: status, reason: 'MALFORMED_OVERRIDE' };
}

/**
 * CRM 五态推断（文件头注释 = 完整规则）。
 *
 * 纯函数：不修改入参、无 IO、同输入必同输出；返回全新对象。
 * 事件面存在性判定与输入数组顺序无关；override 取 detectedAt 最新的合法一条
 * （同一时刻取输入序靠后者，行为确定）。
 */
export function inferCrmStatus(ctx: CrmInferContext): CrmInferResult {
  const eventStatus = inferEventStatus(ctx);

  const ignoredOverrides: IgnoredOverride[] = [];
  let latest: Omit<AppliedOverride, 'effective'> | null = null;

  for (const signal of ctx.signals) {
    if (signal.type !== MANUAL_OVERRIDE_SIGNAL_TYPE) continue;
    const parsed = parseOverridePayload(signal.payload);
    // 显式判等而非 `!parsed.ok`：仓内 strictNullChecks 关闭，truthiness 收窄不生效（tsc 实测）
    if (parsed.ok === false) {
      ignoredOverrides.push({
        signalId: signal.id,
        asserted: parsed.asserted,
        reason: parsed.reason,
        detectedAt: signal.detectedAt,
      });
      continue;
    }
    // 越权/非法条目已被排除在竞争之外——「最新一条是越权 confirmed」不会掩盖更早的合法断言
    if (
      latest == null ||
      signal.detectedAt.getTime() >= latest.detectedAt.getTime()
    ) {
      latest = {
        signalId: signal.id,
        asserted: parsed.asserted,
        detectedAt: signal.detectedAt,
      };
    }
  }

  if (latest == null) {
    return {
      status: eventStatus,
      eventStatus,
      override: null,
      ignoredOverrides,
    };
  }

  // 合成：取「更靠后的状态」（设计理由见文件头）。override 只能向前推，不能抹除库内事实。
  const effective =
    reachStatusIndex(latest.asserted) > reachStatusIndex(eventStatus);

  return {
    status: effective ? latest.asserted : eventStatus,
    eventStatus,
    override: { ...latest, effective },
    ignoredOverrides,
  };
}
