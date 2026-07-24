// M4-INSIGHT F008 — create_share_link 工具（outbound/native，对外分享过闸门）
//
// class:'outbound'（对外·不可撤销：**链接一经生成即暴露**，architecture §9.3.1）→
// 服务端强制停在确认前。outbound 白名单第 6 工具（send_outreach / commit_quote / payout /
// distribute_keys / create_share_link；draft/refine 等 internal 不在列）。
//
// ── harm 三要素（P4，async buildHarm 从 DB 读真值不信任模型转述）──
// ① 可见范围（scope → 数据范围行，与 V8/V12 闸门卡文案同口径）
// ② 有效期（expiresInDays → 绝对时刻，execute 与披露同一算法）
// ③ 「链接一经生成即暴露」红标（evidence 首句：撤销仅阻止后续访问，已转发内容无法收回）
//
// ── P4 零真实公开暴露 ──
// 「执行」= 消费票 → mock `ShareLinkService.createShareLink()`（SHARE_CREATED_MARKER 留痕，
// 零外呼、publicUrl 恒 null）→ `ShareLink` 落库（gateLogId + tokenHash）+ irrev 留痕，**同一事务**。
//
// ── token 明文纪律（ADR-25）──
// token 明文仅在 execute 响应出现一次；DB 只存 sha256 hash（ShareLink.tokenHash）。
// 幂等重入（同 gateActionId）不重新生成、也**无法**再给出明文——token=null + already=true 如实返回。

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { getShareLinkService } from 'lib/ops/share';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

const inputSchema = z.object({
  scope: z
    .enum(['project', 'quarterly'])
    .describe(
      '可见范围：project=本项目汇总指标（V8）/ quarterly=季度跨项目汇总（V12）',
    ),
  projectId: z
    .string()
    .min(1)
    .nullish()
    .describe('scope=project 时必填；quarterly 跨项目留空'),
  expiresInDays: z
    .number()
    .int()
    .positive()
    .max(90)
    .default(14)
    .describe('链接有效期（天，默认 14）'),
});

type CreateShareLinkInput = z.infer<typeof inputSchema>;

export interface CreateShareLinkOutput {
  created: true;
  /** true = 幂等重入（同一闸门动作已生成过，未重复生成）。 */
  already: boolean;
  shareLinkId: string;
  scope: 'project' | 'quarterly';
  projectId: string | null;
  payloadRef: string;
  /**
   * 访问 token 明文——**仅首次执行响应出现一次**（ADR-25：DB 只存 hash）。
   * 幂等重入时为 null（明文不可复现，如实返回而非重新生成）。
   */
  token: string | null;
  expiresAt: string;
  /** mock 恒 null（零真实公开暴露：没有真实地址就不编一个）。 */
  publicUrl: string | null;
  /** true = mock ShareLinkService（**未发生任何真实公开暴露**，P4）。 */
  mocked: boolean;
}

/** 明示拒绝文案锚点（测试断言引用，沿 PAYOUT_* 先例）。 */
export const SHARE_PROJECT_REQUIRED_MSG =
  'scope=project 的分享必须指定项目——拒绝猜测分享范围（P3 明示拒绝不猜）';
export const SHARE_PROJECT_NOT_FOUND_MSG = '项目不存在';

/** 数据范围披露文案（与 V8/V12 闸门卡 harm 行同口径，ADR-08 如实披露）。 */
export function scopeDisclosure(scope: 'project' | 'quarterly'): string {
  return scope === 'project'
    ? '本项目汇总指标 · 不含联系方式'
    : '季度汇总指标 · 不含联系方式';
}

interface ResolvedShare {
  scope: 'project' | 'quarterly';
  projectId: string | null;
  projectName: string | null;
  expiresAt: Date;
}

/**
 * 加载 + 服务端校验（buildHarm 与 execute 共用同一实现——两处各调一次，判定逻辑只有一份）：
 * scope=project 必须带 projectId 且项目真实存在（从 DB 读名称入披露，不信任模型转述）。
 */
async function resolveShare(
  input: CreateShareLinkInput,
  ctx: ToolContext,
): Promise<ResolvedShare> {
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
  );
  if (input.scope === 'quarterly') {
    return {
      scope: 'quarterly',
      projectId: null,
      projectName: null,
      expiresAt,
    };
  }
  if (!input.projectId) {
    throw new Error(`[create-share-link] ${SHARE_PROJECT_REQUIRED_MSG}`);
  }
  const project = await (ctx.db ?? prisma).project.findFirst({
    where: { id: input.projectId, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!project) {
    throw new Error(
      `[create-share-link] ${SHARE_PROJECT_NOT_FOUND_MSG}: ${input.projectId}`,
    );
  }
  return {
    scope: 'project',
    projectId: project.id,
    projectName: project.name,
    expiresAt,
  };
}

/** async buildHarm（§9.5）：三要素 = 可见范围 / 有效期 / 一经生成即暴露红标。 */
async function buildHarm(
  input: CreateShareLinkInput,
  ctx: ToolContext,
): Promise<Harm> {
  const r = await resolveShare(input, ctx);
  const rangeText = scopeDisclosure(r.scope);
  return {
    action: 'create_share_link',
    summary: `生成对外分享链接（${
      r.projectName ? `项目「${r.projectName}」` : '跨项目季度汇总'
    }·有效期 ${input.expiresInDays} 天）`,
    // 对象 = 链接的潜在受众（对外分享无名单可列——如实披露开放面，不假装可控）
    targets: ['任何持有链接者（不限于系统内用户）'],
    scope: rangeText, // ① 可见范围
    quantity: 1,
    irreversible: true,
    // ③ 红标 + ② 有效期（绝对时刻与 execute 同一算法，见 resolveShare）
    evidence: `链接一经生成即暴露：撤销仅能阻止后续访问，已被打开/转发的内容无法收回。数据范围：${rangeText}；有效期：${
      input.expiresInDays
    } 天（至 ${r.expiresAt.toISOString()}）`,
    expiresAt: new Date().toISOString(), // gate 会以其确认令牌 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

/** token 明文 → sha256 hex（沿 gate.ts hashToken 口径；明文不落库）。 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function run(
  input: CreateShareLinkInput,
  ctx: ToolContext,
): Promise<CreateShareLinkOutput> {
  const db = ctx.db ?? prisma;

  // ── 幂等重入（幂等键 = PendingAction.id）：同一闸门动作已生成 → 不重复生成、不重发 token ──
  if (ctx.gateActionId) {
    const existing = await db.shareLink.findFirst({
      where: { tenantId: ctx.tenantId, gateLogId: ctx.gateActionId },
      select: {
        id: true,
        scope: true,
        projectId: true,
        payloadRef: true,
        expiresAt: true,
      },
    });
    if (existing) {
      return {
        created: true,
        already: true,
        shareLinkId: existing.id,
        scope: existing.scope,
        projectId: existing.projectId,
        payloadRef: existing.payloadRef,
        token: null, // 明文不可复现（DB 只存 hash）——如实返回 null 而非重新生成
        expiresAt: (existing.expiresAt ?? new Date(0)).toISOString(),
        publicUrl: null,
        mocked: true, // 本批恒 mock（M5 接真后按原记录推断）
      };
    }
  }

  // ── 服务端二次校验：pending→confirm 窗口内项目被删/失效 → execute 亦拒 ──
  const r = await resolveShare(input, ctx);

  // 外部副作用面（本批 = mock：SHARE_CREATED_MARKER 留痕，零外呼、零真实公开暴露）
  const created = await getShareLinkService().createShareLink(
    {
      scope: r.scope,
      projectId: r.projectId,
      expiresAt: r.expiresAt,
      idempotencyKey: ctx.gateActionId ?? `direct:${randomUUID()}`,
    },
    { tenantId: ctx.tenantId, db: ctx.db, agentId: ctx.agentId },
  );

  // ShareLink 落库：tokenHash（明文不落库）+ gateLogId（经闸门必非空）——与 irrev 留痕同一事务
  const row = await db.shareLink.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: r.projectId,
      scope: r.scope,
      payloadRef: created.payloadRef,
      tokenHash: hashToken(created.token),
      expiresAt: r.expiresAt,
      gateLogId: ctx.gateActionId ?? null,
    },
    select: { id: true },
  });

  return {
    created: true,
    already: false,
    shareLinkId: row.id,
    scope: r.scope,
    projectId: r.projectId,
    payloadRef: created.payloadRef,
    token: created.token, // 明文仅此一次
    expiresAt: r.expiresAt.toISOString(),
    publicUrl: created.publicUrl, // mock 恒 null
    mocked: created.mocked,
  };
}

export const createShareLinkTool: ToolDefinition<
  CreateShareLinkInput,
  CreateShareLinkOutput
> = {
  name: 'create_share_link',
  description:
    '生成对外分享链接（对外·不可撤销：链接一经生成即暴露，任何持有者可访问）。这是 outbound 动作——' +
    '服务端会强制停在你确认前。本版本为 mock 通道：不产生任何真实可公开访问的地址。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
