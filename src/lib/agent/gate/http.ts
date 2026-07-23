// M3-A-REACH-CRM F002 — /api/actions/* 路由层公共件：限流守卫 + GateError → HTTP envelope
//
// P9：/api/actions 四端点 30 req/min/IP，进程内 Map，**fail-open**（取不到 IP / 守卫内部
// 异常一律放行——闸门主防线是票据协议本身，限流只防滥打）。escape hatch 见 rate-limit.ts。

import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
} from 'lib/http/rate-limit';
import { GateError } from './gate';

const ACTIONS_LIMIT = 30;
const ACTIONS_WINDOW_MS = 60 * 1000;

/** 命中限流 → 429 Response；放行 → null。fail-open：任何守卫内部异常都放行。 */
export function actionsRateLimitGuard(req: Request): Response | null {
  try {
    if (isRateLimitDisabled()) return null;
    const ip = clientIpOf(req);
    if (!ip) return null; // fail-open：本地 dev 直连无反代头
    const verdict = checkRateLimit('actions', ip, {
      limit: ACTIONS_LIMIT,
      windowMs: ACTIONS_WINDOW_MS,
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
    console.error('[api/actions] 限流守卫异常（fail-open 放行）:', err);
    return null;
  }
}

/** GateError → 分码 envelope（403/404/409/410 + code）；其余 → 500（不泄内部细节）。 */
export function gateErrorResponse(error: unknown): Response {
  if (error instanceof GateError) {
    return Response.json(
      { code: error.code, error: error.message },
      { status: error.httpStatus },
    );
  }
  console.error('[api/actions] 未预期错误:', error);
  return Response.json(
    { code: 'INTERNAL', error: '操作失败，请重试' },
    { status: 500 },
  );
}
