// M5-AUTH-RLS F001（spec D-1）— Auth.js v5 实例（**nodejs runtime 专用**：依赖 Prisma + bcrypt）。
//
// 装配 = 共享 edge-safe 基座（./config）+ Credentials provider。
// 判定逻辑本身在 ./credentials（纯函数，行为级单测直驱）；这里只做依赖装配。
// 消费方：src/app/api/auth/[...nextauth]/route.ts（handlers）· 服务端取会话（auth()）。
// middleware **不**从这里 import（会把 Prisma 拖进 edge bundle），走 ./config 另建实例（F003）。

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from 'lib/db/prisma';
import { authBaseConfig, resolveAuthSecret } from './config';
import {
  authorizeCredentials,
  type AuthorizeDeps,
  type AuthUserRecord,
} from './credentials';
import { verifyPassword } from './password';

/** 生产依赖装配：Prisma 查 User + bcrypt 比对。 */
export const prismaAuthorizeDeps: AuthorizeDeps = {
  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tenantId: true, passwordHash: true },
    });
  },
  verifyPassword,
};

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
        return authorizeCredentials(raw, prismaAuthorizeDeps);
      },
    }),
  ],
}));
