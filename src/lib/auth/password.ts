// M5-AUTH-RLS F001（spec D-1）— 口令摘要工具。
//
// bcrypt cost 12（spec 定值）。实现选 `bcryptjs`（纯 JS）而非原生 `bcrypt`：
// 后者要 node-gyp 编译，CI/Docker 多阶段构建里是常见的静默失败源；本项目登录 QPS 极低，
// 纯 JS 的额外开销（cost 12 约 200-300ms/次）可接受，且行为与原生 bcrypt 完全兼容（同 $2b$ 格式）。
//
// 铁律：**明文口令只在本模块的函数入参里出现，绝不落库、绝不进日志、绝不进 JWT**。

import bcrypt from 'bcryptjs';

/** spec D-1 定值。改小 = 弱化口令存储强度，单测钉住。 */
export const BCRYPT_COST = 12;

/** 生成口令摘要（注册 / seed 用）。 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** 比对明文与摘要。摘要为空/格式非法一律 false（不抛，调用方按「认证失败」处理）。 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * 「用户不存在」分支的等时比对靶子（timing-attack 缓解）。
 *
 * 不做这一步时：命中用户 → 走一次 cost-12 bcrypt（~250ms）；未命中 → 立即返回（~1ms）。
 * 响应时延因此把「该邮箱是否已注册」泄露给任何人——开放注册（D-4）下这是可批量刷的用户名枚举面。
 * 故未命中分支也照跑一次比对。本常量是对一段随机串的 bcrypt 摘要，**不是任何真实口令的摘要**，
 * 公开无风险（生成方式：bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12)）。
 */
export const TIMING_EQUALIZER_HASH =
  '$2b$12$tL/tOylj7Cd/H8VI4oGhLuIMquCdmwdKLbnoVMkbW9n/W1Kjnhf0.';
