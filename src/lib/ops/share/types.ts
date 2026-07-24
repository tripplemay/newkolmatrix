// M4-INSIGHT F007 — share 适配器抽象（ops 层，architecture §10.3 / ADR-17，沿 ops/partner 范式）
//
// U2/P4「接口先行 + mock」：本批**只有 mock 实现**——真实公开分享页 / CDN 发布留 M5。
// 零真实公开暴露是本批硬约束（spec §7）：mock 不外呼、不发布任何真实可公开访问的对象。
//
// token 明文纪律（ADR-25 先例，schema ShareLink 注释）：本层生成 payloadRef + token，
// **token 明文仅在返回值出现一次**——不落库、不入日志；hash 落 ShareLink.tokenHash
// 归调用方（F008 create_share_link 的 execute 路径）。
//
// ── 真实现（M5）的硬要求，写在这里以免被后来者踩坑（partner/types.ts 同款清单）──
// ① 超时必须用 **AbortController** 真中断请求。`Promise.race` 只解除等待、不中断在途请求，
//    对「分享是否已对外暴露」这种问题会给出错误答案。既知局限见 `ops/email/resend-sender.ts`
//    ——那里的 race 超时是 SDK 不暴露 signal 的不得已（M3-A 结转 soft-watch），不得抄袭。
// ② 幂等键沿本层 `idempotencyKey`（= PendingAction.id）传给 provider，与应用层查重双保险。
// ③ 接真的同时才启 fail-fast 选择器（见 index.ts 的差异理由）。

import type { Prisma } from '@prisma/client';

/** share 调用上下文（mock 落可观测标记需要；ToolContext 结构性满足）。 */
export interface ShareContext {
  tenantId: string;
  /** 执行事务客户端（闸门 execute 路径传入）；mock 留痕随事务提交/回滚。 */
  db?: Prisma.TransactionClient;
  agentId?: string;
}

export class ShareError extends Error {
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
    this.name = 'ShareError';
  }
}

/** 分享可见范围（裁决 #3 两 scope；取值与 Prisma `ShareLinkScope` 枚举一一对应）。 */
export type ShareScope = 'project' | 'quarterly';

// ───────────────────────── 分享链接创建 ─────────────────────────

export interface ShareLinkCreateInput {
  /** harm 三要素之一：可见范围 */
  scope: ShareScope;
  /** scope=project 时必须非空（本层校验，明示拒绝）；quarterly 跨项目可为 null */
  projectId: string | null;
  /** harm 三要素之一：有效期（null = 未设） */
  expiresAt: Date | null;
  /** 幂等键 = PendingAction.id（重放不双发） */
  idempotencyKey: string;
}

export interface ShareLinkCreateResult {
  /** 被分享内容引用（调用方落 ShareLink.payloadRef；存引用不存明文快照） */
  payloadRef: string;
  /**
   * 访问 token 明文——**仅在本返回值出现一次**：调用方 hash 后落 ShareLink.tokenHash
   * （ADR-25），本层不落库、不写入任何日志。
   */
  token: string;
  /** 真实可公开访问地址（mock 恒 null——零公开暴露：没有真实地址就不编一个） */
  publicUrl: string | null;
  /** true = mock（**未发生任何真实公开暴露**）。spec §7 零暴露断言的观测字段之一。 */
  mocked: boolean;
}

export interface ShareLinkService {
  createShareLink(
    input: ShareLinkCreateInput,
    ctx: ShareContext,
  ): Promise<ShareLinkCreateResult>;
}
