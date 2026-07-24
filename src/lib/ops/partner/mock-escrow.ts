// M3-B-DELIVERY F004 — MockEscrowPartner（P1：零真实资金动作）
//
// RELEASED_MARKER 是刻意的测试地面真值（沿 M3-A `SENT_MARKER` 先例，architecture :1393）：
// 闸门用例与 D20 变异测试以「含此标记的 OperationLog 行数」观测**副作用是否发生**——
// 「点确认前副作用零发生」这类断言必须有可观测锚点，否则只能靠「看代码觉得没发生」。
//
// 本实现不外呼、不碰资金：只写一条标记日志代表「托管侧放款已被触发」。
// 真实现（M5）替换本类时，标记日志应保留（观测点零迁移）。

import { prisma } from 'lib/db/prisma';
import {
  PartnerError,
  type EscrowPartner,
  type EscrowReleaseInput,
  type EscrowReleaseResult,
  type PartnerContext,
} from './types';

/** mock 放款副作用的可观测标记。 */
export const RELEASED_MARKER = 'payout:RELEASED';

export class MockEscrowPartner implements EscrowPartner {
  async release(
    input: EscrowReleaseInput,
    ctx: PartnerContext,
  ): Promise<EscrowReleaseResult> {
    if (!(input.amount > 0)) {
      throw new PartnerError(
        'invalid_input',
        `[escrow] 放款金额必须为正: ${input.amount}`,
      );
    }
    if (!input.basis) {
      throw new PartnerError('invalid_input', '[escrow] 放款依据不得为空');
    }

    // mock「放款」副作用：写一条 RELEASED 标记的 OperationLog 代表已对外发生。
    // 经闸门 execute 进入时 ctx.db = 执行事务——留痕与 executed+irrev 同一事务。
    await (ctx.db ?? prisma).operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId ?? null,
        summary:
          `${RELEASED_MARKER} 已向 ${input.payee} 放款 ${input.amount} ${input.currency}` +
          `（依据：${input.basis}；mock 未外呼、未发生真实资金动作）`,
        payloadJson: {
          dealId: input.dealId,
          payee: input.payee,
          amount: input.amount,
          currency: input.currency,
          escrowRef: input.escrowRef,
          idempotencyKey: input.idempotencyKey,
          mocked: true,
        },
      },
    });

    // partnerRef 恒 null：没有真实单据就不编一个（D2 诚实降级）
    return { partnerRef: null, mocked: true };
  }
}
