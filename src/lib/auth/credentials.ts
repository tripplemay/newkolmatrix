// M5-AUTH-RLS F001（spec D-1）— Credentials authorize 的纯逻辑层。
//
// 为什么独立成模块而不是写进 NextAuth 配置里：authorize 是本批唯一的「凭据判定」代码路径，
// 必须能被行为级单测直接驱动（错口令 / 不存在用户 / 无摘要老用户 / 正确口令），
// 不该依赖 next-auth 运行时或活 DB。依赖以 deps 注入（findUserByEmail / verifyPassword），
// 生产实现在 lib/auth/index.ts 用 Prisma + bcrypt 装配。
//
// **401 语义（spec D-1 / architecture:1450）**：认证失败一律「否」→ 由 Auth.js 转 401。
// 本模块不产生任何 403——403 在本仓已锁死为闸门语义，不得被认证面借用。

import { z } from 'zod';
import { TIMING_EQUALIZER_HASH } from './password';

/**
 * 单一错误文案：口令错、用户不存在、老用户无摘要——三种情况对外**完全同文**。
 * 分文案（如「该邮箱未注册」）= 把用户存在性送给攻击者，开放注册下即用户名枚举。
 */
export const INVALID_CREDENTIALS_MESSAGE = '邮箱或密码不正确';

/** 登录表单入参。长度上限防超长串把 bcrypt 拖成 DoS 面。 */
export const credentialsInputSchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(200),
});

export interface AuthUserRecord {
  id: string;
  email: string | null;
  tenantId: string;
  passwordHash: string | null;
}

/** authorize 成功时交给 jwt callback 的最小载荷（spec D-1：JWT 携带 userId + tenantId）。 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
}

export interface AuthorizeDeps {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
}

/** 邮箱规范化：trim + 小写（注册侧须用同一函数，否则大小写变体能绕开唯一约束）。 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 凭据判定。返回 null = 认证失败（调用方转 401 + INVALID_CREDENTIALS_MESSAGE）。
 *
 * 不存在的用户与无摘要的老用户同样跑一次 bcrypt 比对（TIMING_EQUALIZER_HASH），
 * 使三条失败路径的时延同量级——见 password.ts 注释。
 */
export async function authorizeCredentials(
  raw: unknown,
  deps: AuthorizeDeps,
): Promise<AuthenticatedUser | null> {
  const parsed = credentialsInputSchema.safeParse(raw);
  if (!parsed.success) return null;

  const email = normalizeEmail(parsed.data.email);
  const { password } = parsed.data;

  const user = await deps.findUserByEmail(email);
  if (!user || !user.passwordHash) {
    await deps.verifyPassword(password, TIMING_EQUALIZER_HASH);
    return null;
  }

  const ok = await deps.verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  // email 列可空（schema），但既然是按 email 查到的行，此处必有值；防御性收窄。
  if (!user.email) return null;

  return { id: user.id, email: user.email, tenantId: user.tenantId };
}
