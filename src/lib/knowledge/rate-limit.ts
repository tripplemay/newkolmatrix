// M1-D-KNOWLEDGE F002 — 上传 rate-limit（P8，v0.9.11 矩阵 AI 调用类比照）。
//
// tenantId 维度 10 req/min，进程内滑动窗口（单实例部署，ADR 同步解析不建队列——
// 同一取向不引外部存储）。fail-open：限流器自身任何异常 → 放行（限流是保护带不是闸门，
// 不能因它把正常上传打死）。escape：DISABLE_UPLOAD_RATELIMIT=1 全局关断（压测/验收用）。

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

/** tenantId → 窗口内时间戳列表（惰性清理）。 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** 拒绝时给 Retry-After 用（秒） */
  retryAfterSec?: number;
}

/**
 * 上传限流判定。now 可注入（测试决定论）；默认 Date.now。
 * fail-open：内部异常一律放行并 console.warn（不静默）。
 */
export function rateLimitUpload(
  tenantId: string,
  now: () => number = Date.now,
): RateLimitResult {
  try {
    if (process.env.DISABLE_UPLOAD_RATELIMIT === '1') return { allowed: true };
    const t = now();
    const windowStart = t - WINDOW_MS;
    const kept = (buckets.get(tenantId) ?? []).filter((x) => x > windowStart);
    if (kept.length >= MAX_PER_WINDOW) {
      buckets.set(tenantId, kept);
      const oldest = kept[0];
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - t) / 1000)),
      };
    }
    kept.push(t);
    buckets.set(tenantId, kept);
    return { allowed: true };
  } catch (error) {
    console.warn('[knowledge/rate-limit] fail-open：', error);
    return { allowed: true };
  }
}

/** 测试用：清空窗口状态（进程内 Map 跨用例污染防护）。 */
export function resetUploadRateLimit(): void {
  buckets.clear();
}
