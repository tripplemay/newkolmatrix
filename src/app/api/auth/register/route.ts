// M5-AUTH-RLS F005（spec D-4）— POST /api/auth/register：开放注册端点。
//
// 【为什么它在 middleware 的豁免清单里】注册动作本身不可能带会话（F003 的 `api-auth` 前缀
// 豁免覆盖 /api/auth/*）。豁免 = 没有会话闸门，故这里是**面向公网的写入口**：
// 入参一律 zod 校验、唯一性交给 DB 约束、失败不回吐内部细节。限速由 F006 接上。
//
// 【状态码】400 入参不合法 · 409 邮箱已占用（明确 4xx，不是 500——spec D-4 acceptance）·
// 201 建成。**不产生 403**（403 在本仓锁死为闸门语义，architecture.md:1450），
// 也不产生 401（这里不做认证判定）。
//
// 【自动登录在客户端完成】页面拿到 201 后用同一份凭据调 next-auth 的 signIn（signup/page.tsx）。
// 不在服务端签会话：Auth.js v5 的 signIn 面向 Server Action 的 cookie 写入语义，
// 在 route handler 里另起一套签发路径 = 认证面出现第二个签会话的地方，得不偿失。
// 代价是一次额外往返；收益是「签会话」永远只有 Credentials provider 一条路（F001）。
//
// 运行时 = nodejs（Prisma + bcrypt）。

// M5.1b F003（spec D-5）— **引导白名单**：注册限速留痕必须走特权连接。
// 理由：限速判定发生在**解析入参之前**（不让攻击者用请求体消耗资源），此刻既无会话
// 也无租户，留痕写的是审计占位租户的行。
import { privilegedDb as prisma } from 'lib/db/privileged';
import { writeAuthAudit } from 'lib/auth/audit';
import {
  authRateLimitVerdict,
  RATE_LIMITED_MESSAGE,
} from 'lib/auth/rate-limit';
import {
  EMAIL_TAKEN_MESSAGE,
  registerAccount,
  registerInputSchema,
} from 'lib/auth/register';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    // F006：fail-closed 限速（3/min/IP，无 escape hatch）。**在解析入参之前**——
    // 限速的意义之一就是不让攻击者用请求体消耗服务端资源。
    const verdict = authRateLimitVerdict('register', req);
    if (!verdict.allowed) {
      const body = (await req.clone().json().catch((): null => null)) as {
        email?: unknown;
      } | null;
      await writeAuthAudit(
        {
          event: 'register',
          result: 'rate_limited',
          email: typeof body?.email === 'string' ? body.email : null,
        },
        prisma,
      );
      return Response.json(
        { error: RATE_LIMITED_MESSAGE },
        {
          status: 429,
          headers: { 'Retry-After': String(verdict.retryAfterSec) },
        },
      );
    }

    const parsed = registerInputSchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      // 逐字段第一条 message（表单只显示一条；zod message 已是用户可读文案）
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }

    const result = await registerAccount(parsed.data);
    if (!result.ok) {
      return Response.json({ error: EMAIL_TAKEN_MESSAGE }, { status: 409 });
    }

    // 响应只回「谁在哪个租户」——不回 userId 以外的任何账户细节，更不回口令任何形态
    return Response.json(
      {
        created: true,
        email: result.account.email,
        tenantId: result.account.tenantId,
      },
      { status: 201 },
    );
  } catch (error) {
    // 不外泄内部原因（堆栈 / Prisma 错误码都可能透出 schema 细节）
    console.error('[api/auth/register] 注册失败:', error);
    return Response.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
