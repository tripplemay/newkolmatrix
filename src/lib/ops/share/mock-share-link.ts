// M4-INSIGHT F007 — MockShareLinkService（P4：零真实公开暴露）
//
// SHARE_CREATED_MARKER 是刻意的测试地面真值（沿 M3-B `RELEASED_MARKER` / M3-A `SENT_MARKER`
// 先例，architecture :1393）：闸门用例与 D20 变异测试以「含此标记的 OperationLog 行数」观测
// **副作用是否发生**——「点确认前副作用零发生」这类断言必须有可观测锚点。
//
// 本实现不外呼、不发布任何真实可公开访问的页面/CDN 对象：只生成 payloadRef + token 并写一条
// 标记日志代表「分享创建已被触发」。真实现（M5）替换本类时，标记日志应保留（观测点零迁移）。
//
// token 明文纪律（ADR-25）：明文仅出现在返回值一次——**不写入 OperationLog、不落任何库表**；
// hash 落 ShareLink.tokenHash 归调用方（F008 create_share_link）。

import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from 'lib/db/prisma';
import {
  ShareError,
  type ShareContext,
  type ShareLinkCreateInput,
  type ShareLinkCreateResult,
  type ShareLinkService,
} from './types';

/** mock 分享创建副作用的可观测标记。 */
export const SHARE_CREATED_MARKER = 'create_share_link:SHARE_CREATED';

export class MockShareLinkService implements ShareLinkService {
  async createShareLink(
    input: ShareLinkCreateInput,
    ctx: ShareContext,
  ): Promise<ShareLinkCreateResult> {
    if (input.scope === 'project' && !input.projectId) {
      throw new ShareError(
        'invalid_input',
        '[share] scope=project 的分享必须带 projectId（schema ShareLink 注释：应用层保证非空）',
      );
    }
    if (!input.idempotencyKey) {
      throw new ShareError(
        'invalid_input',
        '[share] 幂等键不得为空（= PendingAction.id，重放不双发）',
      );
    }

    // payloadRef：被分享内容的合成引用（真实现 M5 指向物化的分享快照/CDN 对象；存引用不存明文快照）
    const payloadRef = `share-payload:${input.scope}:${
      input.projectId ?? 'cross-project'
    }:${randomUUID()}`;
    // token：加密强随机（32 字节 → 64 位 hex，沿 gate.ts 票据口径）；明文只进返回值
    const token = randomBytes(32).toString('hex');

    // mock「分享创建」副作用：写一条 SHARE_CREATED 标记的 OperationLog 代表已被触发。
    // 经闸门 execute 进入时 ctx.db = 执行事务——留痕与 executed+irrev 同一事务。
    // 注意：payloadJson **不含 token**（明文不入日志，ADR-25）。
    await (ctx.db ?? prisma).operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId ?? null,
        projectId: input.projectId,
        summary:
          `${SHARE_CREATED_MARKER} 已生成 ${input.scope} 范围分享引用 ${payloadRef}` +
          `（mock 未外呼、未产生任何真实可公开访问的链接；token 明文不入日志）`,
        payloadJson: {
          scope: input.scope,
          projectId: input.projectId,
          payloadRef,
          expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
          idempotencyKey: input.idempotencyKey,
          mocked: true,
        },
      },
    });

    // publicUrl 恒 null：没有真实可公开访问的地址就不编一个（D2 诚实降级，沿 partnerRef=null 口径）
    return { payloadRef, token, publicUrl: null, mocked: true };
  }
}
