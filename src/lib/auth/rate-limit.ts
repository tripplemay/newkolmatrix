// M5-AUTH-RLS F006（spec D-4）— 登录 / 注册的 **fail-closed** IP 限速。
//
// 【与仓内既有限速面的差别是刻意的，不是疏忽】
//   - `/api/actions/*`（M3-A F002）：取不到 IP **放行**（fail-open）。限流在那里是保护带，
//     主闸门是两步票据；为限流误伤把正常确认打死，代价大于收益。
//   - `/api/signals/inbound`（M3-A F004）：取不到 IP **拒绝**（fail-closed）。webhook 有签名主闸。
//   - **本模块（认证面）：一律 fail-closed**。登录/注册是「攻击者可以无限重试」的面，
//     限流就是主防线之一：判定不出来时放行 = 在最需要它的时候把它关掉。
//     故 IP 取不到 → 拒；限流器自身抛异常 → 拒。
//
// 【无 escape hatch】仓内既有的 `DISABLE_GATE_RATELIMIT`（压测/调试用）在本模块**不被读取**。
// 一个环境变量就能关掉全站登录限速，等于给部署事故和误配置留了一个静默的后门（spec D-4 明示）。
// 负向断言钉住：tests/integration/auth-rate-limit.test.ts 会设上该变量再验限速仍然生效。
//
// 【口径】进程内固定窗口（同 lib/http/rate-limit：单实例部署；分布式限流是既有登记项，另批）。

import {
  blockKey,
  blockStatus,
  checkRateLimit,
  clientIpOf,
} from 'lib/http/rate-limit';

/* ── 阈值：导出常量（spec D-4 定值，改动即语义变更，单测钉住） ───────────── */

/** 登录：5 次 / 分钟 / IP。 */
export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 60 * 1000;
/** 登录超限后的封禁时长：5 分钟。 */
export const LOGIN_BLOCK_MS = 5 * 60 * 1000;

/** 注册：3 次 / 分钟 / IP。 */
export const REGISTER_ATTEMPT_LIMIT = 3;
export const REGISTER_WINDOW_MS = 60 * 1000;

/** 限流桶名（与其它面隔离：认证面的计数不该被 actions/signals 的流量顶掉）。 */
export const LOGIN_BUCKET = 'auth-login';
export const LOGIN_BLOCK_BUCKET = 'auth-login-block';
export const REGISTER_BUCKET = 'auth-register';

/** 429 的用户可读文案（与前端 AUTH_FORM_MESSAGES.rateLimited 同一句）。 */
export const RATE_LIMITED_MESSAGE = '尝试过于频繁，请稍后再试';

export type AuthRateLimitKind = 'login' | 'register';

export interface AuthRateVerdict {
  allowed: boolean;
  /** Retry-After 秒数（拒绝时 ≥1）。 */
  retryAfterSec: number;
  /** 拒因，仅用于服务端日志与留痕，不外泄给调用方以外的人。 */
  reason?: 'ip_unresolved' | 'too_many_attempts' | 'blocked' | 'limiter_error';
}

/**
 * 限流器依赖（**注入缝**：给了就无条件用）。
 *
 * 存在的唯一理由是让「限流器自身抛异常时会不会放行」成为**可被行为级测试驱动**的路径。
 * 进程内 Map 不会自己坏，但这段代码的语义（fail-closed）必须能被证；
 * 不给注入缝，这条断言就只能靠读代码，等于没有。
 */
export interface AuthRateLimiterDeps {
  check: typeof checkRateLimit;
  blockStatus: typeof blockStatus;
  blockKey: typeof blockKey;
  clientIpOf: typeof clientIpOf;
}

const defaultDeps: AuthRateLimiterDeps = {
  check: checkRateLimit,
  blockStatus,
  blockKey,
  clientIpOf,
};

const DENIED = (
  retryAfterSec: number,
  reason: AuthRateVerdict['reason'],
): AuthRateVerdict => ({ allowed: false, retryAfterSec, reason });

/**
 * 判定一次认证尝试是否放行。
 *
 * 登录：先看封禁窗口（只读，不打标）→ 再数 5/min → 超了就打 5 分钟封禁标记。
 * 注册：只数 3/min（注册没有「反复猜」的语义，不需要封禁窗口）。
 *
 * **任何异常都收敛成拒绝**：catch 里不重抛、不放行。
 */
export function authRateLimitVerdict(
  kind: AuthRateLimitKind,
  req: Request,
  deps: AuthRateLimiterDeps = defaultDeps,
  now: number = Date.now(),
): AuthRateVerdict {
  try {
    const ip = deps.clientIpOf(req);
    // fail-closed 第一条：认不出来源就不放行（本机 dev 直连也有 x-forwarded-for，
    // 见 lib/http/rate-limit clientIpOf 注释；真取不到说明反代链不对，属该修的配置问题）
    if (!ip) return DENIED(LOGIN_WINDOW_MS / 1000, 'ip_unresolved');

    if (kind === 'register') {
      const v = deps.check(REGISTER_BUCKET, ip, {
        limit: REGISTER_ATTEMPT_LIMIT,
        windowMs: REGISTER_WINDOW_MS,
        now,
      });
      return v.allowed
        ? { allowed: true, retryAfterSec: 0 }
        : DENIED(v.retryAfterSec, 'too_many_attempts');
    }

    const blocked = deps.blockStatus(LOGIN_BLOCK_BUCKET, ip, LOGIN_BLOCK_MS, now);
    if (blocked.blocked) return DENIED(blocked.retryAfterSec, 'blocked');

    const v = deps.check(LOGIN_BUCKET, ip, {
      limit: LOGIN_ATTEMPT_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
      now,
    });
    if (v.allowed) return { allowed: true, retryAfterSec: 0 };

    deps.blockKey(LOGIN_BLOCK_BUCKET, ip, now);
    return DENIED(Math.ceil(LOGIN_BLOCK_MS / 1000), 'too_many_attempts');
  } catch (error) {
    // fail-closed 第二条：限流器坏了 → 拒绝。**不 catch 成放行**（变异锚）
    console.error('[auth/rate-limit] 限流判定异常，按拒绝处理（fail-closed）:', error);
    return DENIED(Math.ceil(LOGIN_BLOCK_MS / 1000), 'limiter_error');
  }
}
