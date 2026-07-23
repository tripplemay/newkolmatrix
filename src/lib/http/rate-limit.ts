// M3-A-REACH-CRM F002 — 进程内 IP 限流（P9，v0.9.11 硬要求）
//
// 无 Redis（栈内无此依赖）：固定窗口 + 进程内 Map，nodejs runtime 单进程口径。
// dev 热重载 / 容器重启即清零——单租户 dev 可接受；分布式限流 → M5。
// fail-open / fail-closed 是调用方策略：/api/actions/* 取不到 IP 时放行（fail-open），
// /api/signals/inbound（F004）取不到 IP 时拒绝（fail-closed）——由各 route 自行决定。
// escape hatch：DISABLE_GATE_RATELIMIT=true 全局停用（压测 / 本地调试用）。

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/** Map 无界增长兜底：超过阈值时清扫过期窗口（按需触发，非定时器——nodejs runtime 不留常驻句柄）。 */
const SWEEP_THRESHOLD = 10_000;

function sweepStale(now: number, windowMs: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart >= windowMs) buckets.delete(k);
  }
}

export interface RateLimitOpts {
  /** 窗口内允许的最大请求数。 */
  limit: number;
  /** 窗口长度（毫秒）。 */
  windowMs: number;
  /** 时钟注入（测试用）；缺省 Date.now()。 */
  now?: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** 拒绝时建议的重试等待秒数（Retry-After 头）。 */
  retryAfterSec: number;
}

/**
 * 固定窗口限流判定。bucket 区分限流域（如 'actions' / 'signals'），key 通常为客户端 IP。
 * 纯进程内状态，无 IO——判定本身不会抛错；调用方的 fail-open/closed 策略针对「key 不可得」场景。
 */
export function checkRateLimit(
  bucket: string,
  key: string,
  opts: RateLimitOpts,
): RateLimitVerdict {
  const now = opts.now ?? Date.now();
  const mapKey = `${bucket}\n${key}`;
  sweepStale(now, opts.windowMs);

  const cur = buckets.get(mapKey);
  if (!cur || now - cur.windowStart >= opts.windowMs) {
    buckets.set(mapKey, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (cur.count < opts.limit) {
    buckets.set(mapKey, { ...cur, count: cur.count + 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(
    1,
    Math.ceil((cur.windowStart + opts.windowMs - now) / 1000),
  );
  return { allowed: false, retryAfterSec };
}

/** 测试辅助：清空全部窗口状态（仅测试使用）。 */
export function resetRateLimit(): void {
  buckets.clear();
}

/** escape hatch（P9）：DISABLE_GATE_RATELIMIT=true 时全局停用限流。 */
export function isRateLimitDisabled(): boolean {
  return process.env.DISABLE_GATE_RATELIMIT === 'true';
}

/**
 * 从请求头解析客户端 IP。生产在 nginx 反代后（deploy.md）：x-forwarded-for 首段为客户端 IP。
 * fix_round1 注释校准（验收 low）：Next 15 self-host 会自注入 x-forwarded-for——本地 dev
 * 直连**也有**该头（null 分支实际仅防御性存在）；本地重度调试可用 DISABLE_GATE_RATELIMIT
 * 逃生口。已知边界：XFF 首段在 nginx append 语义下可被客户端伪造旋转——限流是辅助防线
 *（票据协议为主），可信段取法（右起首个非代理段）记 M3-B 顺手项。
 */
export function clientIpOf(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}
