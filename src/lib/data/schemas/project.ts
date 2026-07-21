// M1-A-BRIEF F003 — Project 的 jsonb 列校验（architecture.md:655 登记的 schemas/ 目录首次落地）。
//
// 为什么 jsonb 列必须配 zod：Prisma 对 `Json?` 列的类型只到 `Prisma.JsonValue`，
// 里面装什么它不管。没有 schema 就等于把一个无约束的口袋直接接进领域层——
// 读出来的形状全靠调用方自己猜，而猜错在运行期才炸。

import { z } from 'zod';

/**
 * `Project.goal` 形状（D6）。
 *
 * **不含预算** —— architecture.md:462 的简写让预算同时出现在 goal 与 budgetTotal 两处，
 * 本 spec 收敛为单一真相：预算只在 `budgetTotal` + `currency` 列，goal 只管曝光与周期。
 *
 * 周期用 ISO-8601 日期串（非 Date）：jsonb 里存 Date 会被序列化成串再读回来，
 * 存串则读写同形、可直接比较、跨进程无时区歧义。
 */
export const projectGoalSchema = z.object({
  /** 目标曝光量（次） */
  targetExposure: z.number().int().nonnegative(),
  /** 周期起（ISO-8601 日期，如 2026-07-01） */
  periodStart: z.iso.date(),
  /** 周期止（ISO-8601 日期） */
  periodEnd: z.iso.date(),
});

export type ProjectGoal = z.infer<typeof projectGoalSchema>;

/**
 * 从 jsonb 列宽松读取 goal：形状不合法 → null，不抛错。
 *
 * 与 `readContractSlot` 的读时降级同一取向（脏数据不该让整页崩），
 * 但**不走**契约位机制 —— D11：契约位是给外部/历史深字段用的，
 * goal 是本系统自己写入的强类型字段，出处确定。
 */
export function parseProjectGoal(raw: unknown): ProjectGoal | null {
  const r = projectGoalSchema.safeParse(raw);
  return r.success ? r.data : null;
}
