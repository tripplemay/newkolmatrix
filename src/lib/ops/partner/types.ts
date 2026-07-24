// M3-B-DELIVERY F004 — partner 适配器抽象（ops 层，architecture §9.8 / ADR-17）
//
// U2「接口先行 + mock 适配器」：本批**只有 mock 实现**——合同托管与 key 分发在外部真实完成，
// 系统侧只登记引用 + 走闸门 + 记状态（架构 §1 资金边界：本系统不碰资金与税务）。
//
// P1 零真实资金动作（比 M3-A 真发信更保守）：不接任何真实付款/分发接口，也**不留可误触的开关**。
// 真 Stripe / 电子签 / key 平台留 M5 或按需批。
//
// 两个信道：
//   EscrowPartner  — 托管放款（payout 工具的外部副作用面，F005）
//   KeyDistributor — key 分发（distribute_keys 工具的外部副作用面，F006）
//
// ── 真实现（M5）的硬要求，写在这里以免被后来者踩坑 ──
// ① 超时必须用 **AbortController** 真中断请求。`Promise.race` 只解除等待、不中断在途请求，
//    对「资金动作是否已发生」这种问题会给出错误答案。既知局限见 `ops/email/resend-sender.ts`
//    ——Resend SDK 未暴露 signal 注入点，那里的 race 超时是不得已（M3-A 结转 soft-watch）。
// ② 幂等键沿本层 `idempotencyKey`（= PendingAction.id）传给 provider，与应用层查重双保险
//    （P6 / ops/email 同款）。
// ③ 接真的同时才启 fail-fast 选择器（见 index.ts 的差异理由）。

import type { Prisma } from '@prisma/client';

/** partner 调用上下文（mock 落可观测标记需要；ToolContext 结构性满足）。 */
export interface PartnerContext {
  tenantId: string;
  /** 执行事务客户端（闸门 execute 路径传入）；mock 留痕随事务提交/回滚。 */
  db?: Prisma.TransactionClient;
  agentId?: string;
}

export class PartnerError extends Error {
  constructor(
    public readonly code:
      | 'not_implemented'
      | 'invalid_input'
      | 'timeout'
      | 'rejected'
      | 'provider_error'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'PartnerError';
  }
}

// ───────────────────────── 托管放款 ─────────────────────────

export interface EscrowReleaseInput {
  /** 本次放款归属的 Deal（留痕可回溯） */
  dealId: string;
  /** 收款方（创作者展示名；P7：payee 是收款方不是角色） */
  payee: string;
  amount: number;
  /** ISO 4217 */
  currency: string;
  /** 依据摘要（合同 + 托管 + 披露证据引用）——放款不可无据 */
  basis: string;
  /** 外部托管单号（P4 人工登记的 escrowRef）；未登记时为 null */
  escrowRef: string | null;
  /** 幂等键 = PendingAction.id（重放不双放） */
  idempotencyKey: string;
}

export interface EscrowReleaseResult {
  /** provider 侧引用（mock 恒 null——没有真实单据就不编一个） */
  partnerRef: string | null;
  /** true = mock（**未发生任何真实资金动作**）。P1 断言的观测字段之一。 */
  mocked: boolean;
}

export interface EscrowPartner {
  release(
    input: EscrowReleaseInput,
    ctx: PartnerContext,
  ): Promise<EscrowReleaseResult>;
}

// ───────────────────────── key 分发 ─────────────────────────

export interface KeyDistributionInput {
  dealId: string;
  /** 领取方（创作者展示名） */
  recipient: string;
  /** 本次分发的 key 引用清单（**引用不是明文 key 值**，P8） */
  keyRefs: readonly string[];
  /** 幂等键 = PendingAction.id（重放不双发） */
  idempotencyKey: string;
}

export interface KeyDistributionResult {
  /** 实际分发的 key 引用（mock 原样返回入参） */
  distributedRefs: string[];
  partnerRef: string | null;
  /** true = mock（未发生任何真实分发外呼） */
  mocked: boolean;
}

export interface KeyDistributor {
  distribute(
    input: KeyDistributionInput,
    ctx: PartnerContext,
  ): Promise<KeyDistributionResult>;
}
