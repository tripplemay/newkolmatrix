// M4.8-HARDEN F005 — 清理前的「留痕已落完」等待（S-RV2-10 同族）
//
// 【为什么需要它】走 route 的用例没有 `loop.telemetry` 那样的确定性句柄：
// 超时留痕（loop-timeout-log）与会话遥测（loop-telemetry）都是 fire-and-forget，
// 落库发生在响应体读完之后的几十毫秒内。测试若不等就进 afterAll 删租户，两种坏结局：
//   ① 慢机上被**删后迟到**的那一行打红（看起来像随机 flake）；
//   ② 删得比它快 → 留下一行 `tenantId` 指向已不存在租户的**孤儿** OperationLog，
//      断言绿但库脏（M4.5/M4.6/M4.7 三批反复出现的同一族）。
//
// 判据不是"等固定毫秒"（那只是把 flake 推后），而是**行数连续几轮不再变化**。

import { prisma } from '../../src/lib/db/prisma';

export interface LogSettleOptions {
  /** 至少要看到几行（防"还没开始写就判稳"）。默认 1。 */
  minRows?: number;
  /** 连续多少轮计数不变才算稳。默认 3。 */
  stableRounds?: number;
  /** 每轮间隔毫秒。默认 50。 */
  intervalMs?: number;
  /** 最多等多少轮。默认 60（= 3s）。 */
  maxRounds?: number;
}

/**
 * 等到某租户的 OperationLog 行数稳定下来。
 * @returns 稳定时的行数（超时未稳则返回最后一次计数——不抛，判据交给调用方的断言）
 */
export async function waitForLogSettle(
  tenantId: string,
  opts: LogSettleOptions = {},
): Promise<number> {
  const minRows = opts.minRows ?? 1;
  const stableTarget = opts.stableRounds ?? 3;
  const intervalMs = opts.intervalMs ?? 50;
  const maxRounds = opts.maxRounds ?? 60;

  let last = -1;
  let stable = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await prisma.operationLog.count({ where: { tenantId } });
    if (n === last && n >= minRows) {
      stable += 1;
      if (stable >= stableTarget) return n;
    } else {
      stable = 0;
      last = n;
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return last;
}
