// M5-AUTH-RLS F001（spec D-1）— Auth.js v5 路由装配：/api/auth/*
// M5-AUTH-RLS F006（spec D-4）— 登录尝试的 fail-closed IP 限速前置。
//
// 覆盖 signin / callback / signout / session / csrf / providers 全部内建端点。
// runtime=nodejs：authorize 走 bcrypt + Prisma（edge 不可用）。
// 本路径在 F003 middleware 的豁免清单内——未登录必须可达，否则登录本身被自己的闸门拦住。
// 注意：/api/auth/register（F005 注册端点）是**静态段**，Next 路由优先级高于本 catch-all，
// 不会被这里吞掉。
//
// 【为什么限速加在这一层】凭据判定在 lib/auth/credentials.ts（纯函数）与 Auth.js 内部，
// 那里拿不到 Request，也就拿不到 IP。HTTP 入口是唯一能按 IP 限速的地方。
// 只拦**登录尝试**（credentials 的 callback / signin POST）：csrf / session / providers
// 这些不是尝试，限它们只会把正常页面打死。

import type { NextRequest } from 'next/server';
import { handlers } from 'lib/auth';
import { LOGIN_PATH } from 'lib/auth/config';
import { resolveRequestOrigin } from 'lib/auth/access-policy';
import { authRateLimitVerdict } from 'lib/auth/rate-limit';
import { writeAuthAudit } from 'lib/auth/audit';
import { prisma } from 'lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handlers.GET;

/** 算作「一次登录尝试」的路径（Auth.js credentials 流的两个入口）。 */
export function isLoginAttemptPath(pathname: string): boolean {
  return (
    pathname === '/api/auth/callback/credentials' ||
    pathname === '/api/auth/signin/credentials'
  );
}

/**
 * 从表单体里取邮箱——**只为算域名**（留痕元数据），不写进任何字段。
 * 解析失败一律 null：限速响应不能因为体不好解而变成 500。
 */
async function emailOfAttempt(req: NextRequest): Promise<string | null> {
  try {
    const body = await req.clone().text();
    return new URLSearchParams(body).get('email');
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!isLoginAttemptPath(req.nextUrl.pathname)) return handlers.POST(req);

  const verdict = authRateLimitVerdict('login', req);
  if (verdict.allowed) return handlers.POST(req);

  await writeAuthAudit(
    { event: 'login', result: 'rate_limited', email: await emailOfAttempt(req) },
    prisma,
  );

  /**
   * 响应形状必须让 next-auth 的客户端 `signIn()` 解析得动：它无条件
   * `await res.json()` 然后 `new URL(data.url)`（node_modules/next-auth/react.js:165,174）。
   * 少了合法的 `url` 字段，页面拿到的会是解析异常兜底的「登录失败」而不是「尝试过于频繁」。
   * error / code 走 URL 参数，与 lib/auth/form-messages.ts 的 loginErrorMessage 对齐。
   */
  const origin = resolveRequestOrigin(req.headers, req.nextUrl.origin);
  const url = new URL(LOGIN_PATH, origin);
  url.searchParams.set('error', 'RateLimited');
  url.searchParams.set('code', 'rate_limited');

  return Response.json(
    { url: url.toString(), code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } },
  );
}
