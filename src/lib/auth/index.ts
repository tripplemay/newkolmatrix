// M5-AUTH-RLS F001（spec D-1）— Auth.js v5 实例（**nodejs runtime 专用**：依赖 Prisma + bcrypt）。
//
// 装配 = 共享 edge-safe 基座（./config）+ Credentials provider。
// 判定逻辑本身在 ./credentials（纯函数，行为级单测直驱）；这里只做依赖装配。
// 消费方：src/app/api/auth/[...nextauth]/route.ts（handlers）· 服务端取会话（auth()）。
// middleware **不**从这里 import（会把 Prisma 拖进 edge bundle），走 ./config 另建实例（F003）。

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
// M5.1b F003（spec D-5）— **引导白名单**：登录路径必须走特权连接。
// 理由：登录的输入只有 email，租户是这次查询的**产物**；RLS 却要求先有租户才能查
//（审计 B2-1 实测：kol_app 无租户变量下 user.findUnique 恒 null ⇒ 没人能登录）。
// 失败登录的归因查询与两处 writeAuthAudit 同理：都发生在会话存在之前，且留痕写的是
// 占位租户 / 被撞库租户的行，在 kol_app 下被 USING + WITH CHECK 双向拒。
import { privilegedDb } from 'lib/db/privileged';
import { authBaseConfig, resolveAuthSecret } from './config';
import {
  authorizeCredentials,
  normalizeEmail,
  type AuthenticatedUser,
  type AuthorizeDeps,
  type AuthUserRecord,
} from './credentials';
import { verifyPassword } from './password';
import { writeAuthAudit } from './audit';

/** 生产依赖装配：Prisma 查 User + bcrypt 比对。 */
export const prismaAuthorizeDeps: AuthorizeDeps = {
  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return privilegedDb.user.findUnique({
      where: { email },
      select: { id: true, email: true, tenantId: true, passwordHash: true },
    });
  },
  verifyPassword,
};

/**
 * M5-AUTH-RLS F006（spec D-4）— 登录成 / 败留痕（元数据 only，口径见 ./audit）。
 *
 * 【为什么写在这里而不是 HTTP 层】这里是**唯一**知道判定结果的地方。HTTP 层只能靠猜
 *（看 302 的 query 参数），换个 Auth.js 版本就静默失灵。
 *
 * 【失败为什么要查一次用户】把失败归到**被尝试的那个账号所在租户**——被撞库的租户
 * 因此在自己的审计里看得见有人在敲自己的门。查无此人（扫号）→ 落审计占位租户。
 * 这次查询只发生在失败路径，且该路径已被 5/min/IP 限住。
 */
async function recordLoginAttempt(
  raw: unknown,
  user: AuthenticatedUser | null,
): Promise<void> {
  const rawEmail = (raw as { email?: unknown } | null)?.email;
  const email = typeof rawEmail === 'string' ? rawEmail : null;

  if (user) {
    await writeAuthAudit(
      { event: 'login', result: 'ok', email: user.email, tenantId: user.tenantId },
      privilegedDb,
    );
    return;
  }

  let tenantId: string | null = null;
  if (email) {
    try {
      const target = await privilegedDb.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { tenantId: true },
      });
      tenantId = target?.tenantId ?? null;
    } catch {
      tenantId = null; // 查不动就落占位租户，不因留痕把登录流程打断
    }
  }
  await writeAuthAudit(
    { event: 'login', result: 'invalid_credentials', email, tenantId },
    privilegedDb,
  );
}

// 函数式配置：每次请求求值一次。**刻意如此**——secret 若在模块顶层求值，
// `next build` 的 page-data 收集阶段（NODE_ENV=production）就会在没有 AUTH_SECRET 的
// 构建环境里直接构建失败。运行时缺 secret 仍是 fail-closed：请求抛错、签不出会话。
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authBaseConfig,
  secret: resolveAuthSecret(),
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      // 返回 null → Auth.js 判认证失败（回登录页带 error=CredentialsSignin，不发会话 cookie）。
      // 不在此处抛带细节的错：错误详情外泄即用户存在性泄露（见 credentials.ts）。
      async authorize(raw) {
        const user = await authorizeCredentials(raw, prismaAuthorizeDeps);
        await recordLoginAttempt(raw, user); // F006 留痕（旁路，永不抛）
        return user;
      },
    }),
  ],
}));
