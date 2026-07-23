// AGENT-FOUNDATION F009 — harm 单一 zod schema（AI→人闸门利害披露，架构稿 §8.1 / PRD §10）
//
// 所有 outbound 动作的利害结构由此单一 schema 定义。确认卡如实列全部利害：
// 批量发列全部收件人（不折叠）、报价标金额与授权范围、放款标收款方，统一带「对外·不可撤销」红标。
// 无阈值分级（D28）：金额大小不改变确认流程，只如实披露。

import { z } from 'zod';

export const HARM_LABEL = '对外·不可撤销';

export const harmSchema = z.object({
  /** 动作（send_outreach / commit_quote / payout / distribute_key / share_external …）。 */
  action: z.string().min(1),
  /** 一句话人类可读的动作描述。 */
  summary: z.string().min(1),
  /** 对象全名单——批量必须列全，不折叠（如全部收件人 / 收款方 / key 领取方）。 */
  targets: z.array(z.string()).min(1),
  /** 金额（如报价 / 放款）。无阈值分级（D28），仅如实披露。 */
  amount: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  /** 数量（如批量条数 / 分发 key 数）。 */
  quantity: z.number().int().nonnegative().optional(),
  /** 授权范围（如报价的授权上限 / 分享范围）。 */
  scope: z.string().optional(),
  /** 是否不可逆（outbound 通常为 true）。 */
  irreversible: z.boolean(),
  /** 证据 / 依据（这次动作基于什么，供人核对）。 */
  evidence: z.string().min(1),
  /** 过期时间（ISO 8601，确认令牌 TTL 到期后需重新发起）。 */
  expiresAt: z.string(),
  /** 统一红标——所有 outbound 一律「对外·不可撤销」。 */
  label: z.literal(HARM_LABEL),
});

export type Harm = z.infer<typeof harmSchema>;

/** 待确认动作信封（executeTool 对 outbound 未过闸门时返回给模型/前端的结构）。 */
export interface PendingActionEnvelope {
  status: 'pending';
  /** 服务端 PendingAction 记录 id，供 /api/actions/[id]/{confirm,execute,reject} 引用（F002）。 */
  pendingActionId: string;
  toolName: string;
  harm: Harm;
}

/** 类型守卫：executeTool 返回的是 pending 信封（还是已执行结果）。 */
export function isPendingEnvelope(x: unknown): x is PendingActionEnvelope {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as { status?: unknown }).status === 'pending' &&
    typeof (x as { pendingActionId?: unknown }).pendingActionId === 'string'
  );
}
