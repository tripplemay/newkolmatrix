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
        checkRateLimit('actions', '1.2.3.4', {
          limit: 30,
          windowMs: 60_000,
          now: T0 + i * 100,
        }).allowed,
      ).toBe(true);
    }
    const denied = checkRateLimit('actions', '1.2.3.4', {
      limit: 30,
      windowMs: 60_000,
      now: T0 + 3100,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('窗口滚动后计数清零重新放行', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('actions', '1.2.3.4', {
        limit: 30,
        windowMs: 60_000,
        now: T0,
      });
    }
    expect(
      checkRateLimit('actions', '1.2.3.4', {
        limit: 30,
        windowMs: 60_000,
        now: T0,
      }).allowed,
    ).toBe(false);
    // 60s 后新窗口
    expect(
      checkRateLimit('actions', '1.2.3.4', {
        limit: 30,
        windowMs: 60_000,
        now: T0 + 60_000,
      }).allowed,
    ).toBe(true);
  });

  it('不同 IP / 不同 bucket 互不影响', () => {
    for (let i = 0; i < 30; i++) {
      checkRateLimit('actions', '1.2.3.4', {
        limit: 30,
        windowMs: 60_000,
        now: T0,
      });
    }
    expect(
      checkRateLimit('actions', '1.2.3.4', {
        limit: 30,
        windowMs: 60_000,
        now: T0,
      }).allowed,
    ).toBe(false);
    expect(
      checkRateLimit('actions', '5.6.7.8', {
        limit: 30,
        windowMs: 60_000,
        now: T0,
      }).allowed,
    ).toBe(true);
    expect(
      checkRateLimit('signals', '1.2.3.4', {
        limit: 20,
        windowMs: 60_000,
        now: T0,
      }).allowed,
    ).toBe(true);
  });

  it('retryAfterSec = 到窗口结束的剩余秒数（向上取整，至少 1）', () => {
    checkRateLimit('actions', '9.9.9.9', {
      limit: 1,
      windowMs: 60_000,
      now: T0,
    });
    const denied = checkRateLimit('actions', '9.9.9.9', {
      limit: 1,
      windowMs: 60_000,
      now: T0 + 59_500,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(1);
  });
});

describe('clientIpOf', () => {
  it('x-forwarded-for 取右起首个非内网段（跳过我方反代自身的内网段）', () => {
    const req = new Request('http://x/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientIpOf(req)).toBe('203.0.113.7');
  });

  // M3-B F008 回归（M3-A F002-low soft-watch 转正）：XFF 左侧各段由客户端提供、
  // 可伪造并逐次旋转以绕开按 IP 的限流；取右起首个非代理段后，伪造前缀不再影响分桶。
  it('伪造的左侧段被忽略：同一真实客户端伪造不同前缀 → 归同一个桶', () => {
    const forged1 = new Request('http://x/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' },
    });
    const forged2 = new Request('http://x/', {
      headers: { 'x-forwarded-for': '5.6.7.8, 9.9.9.9, 203.0.113.7' },
    });
    expect(clientIpOf(forged1)).toBe('203.0.113.7');
    expect(clientIpOf(forged2)).toBe('203.0.113.7');
  });

  it('多级反代：跳过内网段直到公网段（10./172.16-31./192.168./127./::1）', () => {
    const req = new Request('http://x/', {
      headers: {
        'x-forwarded-for': '198.51.100.5, 172.17.0.1, 10.1.2.3, 127.0.0.1',
      },
    });
    expect(clientIpOf(req)).toBe('198.51.100.5');
  });

  it('全内网（本地 dev / 容器内直连）→ 取最右段，限流退化为单桶但不崩', () => {
    const req = new Request('http://x/', {
      headers: { 'x-forwarded-for': '::1, 127.0.0.1' },
    });
    expect(clientIpOf(req)).toBe('127.0.0.1');
  });

  it('无 xff 时回落 x-real-ip；两者皆无 → null（调用方 fail-open/closed 自决）', () => {
    expect(
      clientIpOf(
        new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.2' } }),
      ),
    ).toBe('198.51.100.2');
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
