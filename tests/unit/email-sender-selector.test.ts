// M3-A-REACH-CRM F003 — EmailSender env 选择器三分支单测（acceptance：三分支实测）
//
// ① 有 key → ResendEmailSender（真投递实现；本测试不外呼，仅断言实例类型）
// ② 无 key + 非 prod → MockEmailSender（CI 与本地默认，不外呼）
// ③ 无 key + prod → SendEmailError 拒发（P4 fail-fast：真实触达不静默消失在 mock 日志）

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEmailSender } from '../../src/lib/ops/email';
import { MockEmailSender } from '../../src/lib/ops/email/mock-sender';
import { ResendEmailSender } from '../../src/lib/ops/email/resend-sender';
import { SendEmailError } from '../../src/lib/ops/email/types';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getEmailSender 三分支（P4）', () => {
  it('① RESEND_API_KEY 在场 → ResendEmailSender', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key_realish_0123456789');
    expect(getEmailSender()).toBeInstanceOf(ResendEmailSender);
  });

  it('② 无 key + 非 production → MockEmailSender（默认不外呼）', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
    expect(getEmailSender()).toBeInstanceOf(MockEmailSender);
  });

  it('③ 无 key + production → 抛 SendEmailError 拒发（fail-fast，不静默 mock）', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getEmailSender()).toThrowError(SendEmailError);
  });

  it('③b placeholder key + production → 同样拒发（防呆，旧项目同款）', () => {
    vi.stubEnv('RESEND_API_KEY', 'placeholder-do-not-use');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getEmailSender()).toThrowError(SendEmailError);
  });

  it('placeholder key + dev → 视同无 key 回落 mock', () => {
    vi.stubEnv('RESEND_API_KEY', 'mock-key');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getEmailSender()).toBeInstanceOf(MockEmailSender);
  });
});
