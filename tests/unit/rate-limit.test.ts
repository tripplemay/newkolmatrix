// M3-A-REACH-CRM F002 — 进程内 IP 限流单测（P9）
//
// 纯逻辑测试：时钟经 opts.now 注入，不依赖真实时间流逝。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
  resetRateLimit,
} from '../../src/lib/http/rate-limit';

const T0 = 1_700_000_000_000;

describe('checkRateLimit（固定窗口）', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('窗口内前 limit 次放行，第 limit+1 次拒绝', () => {
    for (let i = 0; i < 30; i++) {
      expect(
        checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 + i * 100 })
          .allowed,
      ).toBe(true);
    }
    const denied = checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 + 3100 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('窗口滚动后计数清零重新放行', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 });
    }
    expect(checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 }).allowed).toBe(false);
    // 60s 后新窗口
    expect(
      checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 + 60_000 }).allowed,
    ).toBe(true);
  });

  it('不同 IP / 不同 bucket 互不影响', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 });
    }
    expect(checkRateLimit('actions', '1.2.3.4', { limit: 30, windowMs: 60_000, now: T0 }).allowed).toBe(false);
    expect(checkRateLimit('actions', '5.6.7.8', { limit: 30, windowMs: 60_000, now: T0 }).allowed).toBe(true);
    expect(checkRateLimit('signals', '1.2.3.4', { limit: 20, windowMs: 60_000, now: T0 }).allowed).toBe(true);
  });

  it('retryAfterSec = 到窗口结束的剩余秒数（向上取整，至少 1）', () => {
    checkRateLimit('actions', '9.9.9.9', { limit: 1, windowMs: 60_000, now: T0 });
    const denied = checkRateLimit('actions', '9.9.9.9', { limit: 1, windowMs: 60_000, now: T0 + 59_500 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(1);
  });
});

describe('clientIpOf', () => {
  it('x-forwarded-for 取首段（nginx 反代真实客户端）', () => {
    const req = new Request('http://x/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientIpOf(req)).toBe('203.0.113.7');
  });

  it('无 xff 时回落 x-real-ip；两者皆无 → null（调用方 fail-open/closed 自决）', () => {
    expect(clientIpOf(new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe(
      '198.51.100.2',
    );
    expect(clientIpOf(new Request('http://x/'))).toBeNull();
  });
});

describe('escape hatch（P9）', () => {
  it('DISABLE_GATE_RATELIMIT=true 时报告停用', () => {
    const orig = process.env.DISABLE_GATE_RATELIMIT;
    try {
      process.env.DISABLE_GATE_RATELIMIT = 'true';
      expect(isRateLimitDisabled()).toBe(true);
      process.env.DISABLE_GATE_RATELIMIT = 'false';
      expect(isRateLimitDisabled()).toBe(false);
    } finally {
      if (orig === undefined) delete process.env.DISABLE_GATE_RATELIMIT;
      else process.env.DISABLE_GATE_RATELIMIT = orig;
    }
  });
});
