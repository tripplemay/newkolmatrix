// M3-B-DELIVERY F004 — MockKeyDistributor（P1/P8：零真实分发外呼）
//
// DISTRIBUTED_MARKER 同 RELEASED_MARKER 的角色：分发副作用的可观测锚点。
// 本实现不外呼、不生成 key、不对接平台——key 池由人工登记（F008），本类只把
// 「这批 keyRef 已交给领取方」这件事记成可观测事实。

import { prisma } from 'lib/db/prisma';
import {
  PartnerError,
  type KeyDistributionInput,
  type KeyDistributionResult,
  type KeyDistributor,
  type PartnerContext,
} from './types';

/** mock 分发副作用的可观测标记。 */
export const DISTRIBUTED_MARKER = 'distribute_keys:DISTRIBUTED';

export class MockKeyDistributor implements KeyDistributor {
  async distribute(
    input: KeyDistributionInput,
    ctx: PartnerContext,
  ): Promise<KeyDistributionResult> {
    if (input.keyRefs.length === 0) {
      // 空分发是无意义动作——明示拒绝不静默成功（P3 同源纪律）
      throw new PartnerError('invalid_input', '[keys] 分发清单为空');
    }

    await (ctx.db ?? prisma).operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId ?? null,
        summary:
          `${DISTRIBUTED_MARKER} 已向 ${input.recipient} 发放 ${input.keyRefs.length} 个 key` +
          `（mock 未外呼；一经发放不可回收）`,
        payloadJson: {
          dealId: input.dealId,
          recipient: input.recipient,
          // 存引用不存明文 key 值（P8）——日志同样不得落明文
          keyRefs: [...input.keyRefs],
          idempotencyKey: input.idempotencyKey,
          mocked: true,
        },
      },
    });

    return {
      distributedRefs: [...input.keyRefs],
      partnerRef: null,
      mocked: true,
    };
  }
}
