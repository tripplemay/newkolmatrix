// M3-B-DELIVERY F008 — /api/delivery/* 路由层公共件：限流守卫 + 错误 → HTTP envelope
//
// P9：三端点 30 req/min/IP，进程内 Map，**fail-open**（取不到 IP / 守卫内部异常一律放行）——
// 与 /api/actions/* 同类（mutation、人操作），维度与兜底一致。escape hatch：DISABLE_GATE_RATELIMIT。
// 这三个端点是 internal（可撤销、不对外、不花钱，D27），限流只防误点连打与滥打。

import { z } from 'zod';
import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
} from 'lib/http/rate-limit';
import { DeliveryRegisterError } from './register';
import { DealTransitionError } from './deal-status';

const DELIVERY_LIMIT = 30;
const DELIVERY_WINDOW_MS = 60 * 1000;

/** 命中限流 → 429 Response；放行 → null。fail-open：任何守卫内部异常都放行。 */
export function deliveryRateLimitGuard(req: Request): Response | null {
  try {
    if (isRateLimitDisabled()) return null;
    const ip = clientIpOf(req);
    if (!ip) return null; // fail-open
    const verdict = checkRateLimit('delivery', ip, {
      limit: DELIVERY_LIMIT,
      windowMs: DELIVERY_WINDOW_MS,
    });
    if (verdict.allowed) return null;
    return Response.json(
      { code: 'RATE_LIMITED', error: '请求过于频繁，请稍后重试' },
      {
        status: 429,
        headers: { 'Retry-After': String(verdict.retryAfterSec) },
      },
    );
  } catch (err) {
    console.error('[api/delivery] 限流守卫异常（fail-open 放行）:', err);
    return null;
  }
}

/** zod 校验失败 → 400 明示（逐字段列出，不是一句「参数错误」）。 */
export function badRequest(error: z.ZodError): Response {
  return Response.json(
    {
      code: 'INVALID_INPUT',
      error: '入参不合法',
      issues: error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
    { status: 400 },
  );
}

/** 解析 JSON body（非法 JSON 也走 400，不 500）。 */
export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** 业务错误 → envelope：404 不存在 / 409 冲突 / 400 非法 / 500 其余（不泄内部细节）。 */
export function deliveryErrorResponse(error: unknown): Response {
  if (error instanceof DeliveryRegisterError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
    return Response.json({ code: error.code, error: error.message }, { status });
  }
  if (error instanceof DealTransitionError) {
    return Response.json(
      { code: `DEAL_${error.reason}`, error: error.message },
      { status: error.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }
  // 明文 key 守卫等输入类错误（服务层抛的普通 Error）→ 400 明示原文
  if (error instanceof Error && /keyRef/.test(error.message)) {
    return Response.json(
      { code: 'INVALID_INPUT', error: error.message },
      { status: 400 },
    );
  }
  console.error('[api/delivery] 未预期错误:', error);
  return Response.json(
    { code: 'INTERNAL', error: '操作失败，请重试' },
    { status: 500 },
  );
}
