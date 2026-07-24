// M4-INSIGHT F009 — /api/insight/* 路由层公共件：限流守卫（P8）
//
// 30 req/min/IP，进程内 Map，**fail-open**（取不到 IP / 守卫内部异常一律放行）——
// 与 /api/delivery/* / /api/actions/* 同类（mutation、人操作），维度与兜底一致。
// escape hatch：DISABLE_GATE_RATELIMIT（复用 lib/http/rate-limit 全局开关）。

import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
} from 'lib/http/rate-limit';

const INSIGHT_LIMIT = 30;
const INSIGHT_WINDOW_MS = 60 * 1000;

/** 命中限流 → 429 Response；放行 → null。fail-open：任何守卫内部异常都放行。 */
export function insightRateLimitGuard(req: Request): Response | null {
  try {
    if (isRateLimitDisabled()) return null;
    const ip = clientIpOf(req);
    if (!ip) return null; // fail-open
    const verdict = checkRateLimit('insight', ip, {
      limit: INSIGHT_LIMIT,
      windowMs: INSIGHT_WINDOW_MS,
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
    console.error('[api/insight] 限流守卫异常（fail-open 放行）:', err);
    return null;
  }
}
