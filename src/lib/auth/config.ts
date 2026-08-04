// M5-AUTH-RLS F001（spec D-1）— Auth.js v5 共享配置（**edge-safe**）。
//
// 本文件被两处消费：
//   1. lib/auth/index.ts（nodejs runtime）：补上 Credentials provider（bcrypt + Prisma）后建实例
//   2. src/middleware.ts（F003，默认 edge runtime）：只需解会话 cookie，**不能**触到 Prisma / bcrypt
// 故这里零 provider、零 DB 依赖——Auth.js 官方的 split-config 用法。
//
// 会话策略 JWT（spec D-1：无 adapter 表）；JWT 载荷只放 { userId, tenantId }，
// 绝不放口令摘要或任何凭据材料（JWT 对持有者可读）。

import type { NextAuthConfig } from 'next-auth';

/** 未登录时页面跳转的落点（F003 middleware 与 Auth.js 内建跳转共用同一常量）。 */
export const LOGIN_PATH = '/login';
export const SIGNUP_PATH = '/signup';

/** 会话有效期：7 天（滑动续期由 Auth.js 默认 updateAge 处理）。 */
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/** 非生产环境缺 AUTH_SECRET 时的回落值——**只在非生产可用**，见 resolveAuthSecret。 */
export const DEV_AUTH_SECRET_FALLBACK = 'dev-only-insecure-auth-secret-m5';

/**
 * 解析 AUTH_SECRET（spec D-1：dev .env / CI secret / VPS 人工前置）。
 *
 * 生产缺失 → **抛错停机**。这是刻意的：静默回落到公开的 dev 常量意味着任何人都能自签会话 cookie，
 * 是比「服务起不来」严重得多的故障（负向断言钉住，见 tests/unit/auth-config.test.ts）。
 */
export function resolveAuthSecret(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string {
  const secret = env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      '[auth] 缺少 AUTH_SECRET。生产环境必须显式配置（VPS .env / CI secret），不提供回落值。',
    );
  }
  return DEV_AUTH_SECRET_FALLBACK;
}

/**
 * edge-safe 基座配置。providers 由各消费方补齐（middleware 侧保持空数组即可解 cookie）。
 *
 * **不在此处求值 secret**：NextAuth(config) 在模块顶层执行，而 `next build` 的
 * "Collecting page data" 阶段会以 NODE_ENV=production 载入每个 route 模块——
 * 一旦在模块作用域调 resolveAuthSecret()，没有 AUTH_SECRET 的构建环境（CI / Docker 构建期）
 * 会直接构建失败（实测：Failed to collect page data for /api/auth/[...nextauth]）。
 * 故各消费方改用 NextAuth 的**函数式配置**在每次请求时才求值（见 lib/auth/index.ts）。
 *
 * trustHost：本项目自托管于 nginx 反代后，Host 由我方反代控制，可信。
 */
export const authBaseConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SEC },
  pages: { signIn: LOGIN_PATH, error: LOGIN_PATH },
  providers: [] as NextAuthConfig['providers'],
  callbacks: {
    /** 登录当次把 { userId, tenantId } 钉进 JWT；后续请求 user 为 undefined，token 原样透传。 */
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = (user as { tenantId?: string }).tenantId;
      }
      return token;
    },
    /** session 回调透出 userId / tenantId（F004 的 buildToolContext 据此解析租户）。 */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? '';
        session.user.tenantId = token.tenantId ?? '';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
