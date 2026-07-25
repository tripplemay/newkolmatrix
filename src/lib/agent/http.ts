// M4.5-AGENT-LOOP F004 — /api/agent/* 路由层公共件：限流守卫（P6）
//
// 30 req/min/IP，进程内 Map，**fail-open**（取不到 IP / 守卫内部异常一律放行）——
// 与 /api/insight/* / /api/delivery/* / /api/actions/* 同类（mutation、人操作），
// 维度与兜底一致。escape hatch：DISABLE_GATE_RATELIMIT（复用 lib/http/rate-limit 全局开关）。

import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
} from 'lib/http/rate-limit';

const AGENT_LIMIT = 30;
const AGENT_WINDOW_MS = 60 * 1000;

/** 命中限流 → 429 Response；放行 → null。fail-open：任何守卫内部异常都放行。 */
export function agentRateLimitGuard(req: Request): Response | null {
  try {
    if (isRateLimitDisabled()) return null;
    const ip = clientIpOf(req);
    if (!ip) return null; // fail-open
    const verdict = checkRateLimit('agent', ip, {
      limit: AGENT_LIMIT,
      windowMs: AGENT_WINDOW_MS,
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
    console.error('[api/agent] 限流守卫异常（fail-open 放行）:', err);
    return null;
  }
}
