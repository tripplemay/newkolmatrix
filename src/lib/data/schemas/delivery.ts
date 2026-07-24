// M3-B-DELIVERY F008 — 交付登记入参 zod（系统边界校验，坏入参 400 明示）
//
// 三端点共用：POST /api/delivery/deals/[id]/refs · PATCH /api/delivery/deliverables/[id]
// · POST /api/delivery/deals/[id]/keys。
// schemas 与服务层分离（schemas/project.ts / match.ts 先例）：route 校验形状，服务层做业务判定。

import { z } from 'zod';

/** 外部单号引用：留白与超长一律拒（防把整段合同正文塞进来）。 */
const refString = z
  .string()
  .trim()
  .min(1, '引用不得为空')
  .max(200, '引用过长（≤200 字符）');

/** 登记合同 / 托管单号（至少给一个；两个都给则一次推进到 escrowed）。 */
export const registerRefsSchema = z
  .object({
    contractRef: refString.optional(),
    escrowRef: refString.optional(),
  })
  .refine(
    (v) => v.contractRef != null || v.escrowRef != null,
    'contractRef 与 escrowRef 至少提供一个',
  );

export type RegisterRefsInput = z.infer<typeof registerRefsSchema>;

/** 人工核验：三态 + 证据引用 + 核验人（pending 不在其中——核验不会把条件退回「未开始」）。 */
export const verifyDeliverableSchema = z.object({
  status: z.enum(['met', 'missing', 'na']),
  evidenceRef: refString.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  /** 核验人（单角色 dev 缺省 'operator'）。 */
  verifiedBy: z.string().trim().min(1).max(80).optional(),
});

export type VerifyDeliverableInput = z.infer<typeof verifyDeliverableSchema>;

/** key 池登记：引用清单（**不是明文 key 值**，P8——明文形状由服务层守卫再拦一次）。 */
export const registerKeysSchema = z.object({
  keyRefs: z
    .array(refString)
    .min(1, 'keyRefs 不得为空')
    .max(500, '单次登记 ≤500 条'),
});

export type RegisterKeysInput = z.infer<typeof registerKeysSchema>;
