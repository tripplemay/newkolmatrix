// M5-AUTH-RLS F002 — 登录/注册表单错误映射与前置校验（acceptance：401 / 限速 / 校验失败三类
// 错误态必须有用户可读文案）。
//
// 分层：本文件钉「哪种失败 → 哪句话」；浏览器侧（tests/visual/auth-pages.spec.ts）只钉
// 「错误态确实渲染出这套文案中的一条」——两层合起来才等于「错误态可见且正确」。
//
// 变异对照：
//   1. loginErrorMessage 把 401 与 429 合并成同一句 → 「限速优先于凭据错」红
//   2. 凭据错文案改成「该邮箱未注册」→ 「与 authorize 单一文案常量同源」红
//   3. isStrongPassword 放宽（去掉数字要求 / 降到 8 位）→ 强度用例红
//   4. validateLoginForm 直接返回 null（不校验）→ 空表单/坏邮箱用例红

import { describe, it, expect } from 'vitest';
import {
  AUTH_FORM_MESSAGES,
  ALL_AUTH_FORM_MESSAGES,
  loginErrorMessage,
  registerErrorMessage,
  isStrongPassword,
  validateLoginForm,
  validateSignupForm,
} from 'lib/auth/form-messages';
import { INVALID_CREDENTIALS_MESSAGE } from 'lib/auth/credentials';

describe('M5-AUTH-RLS F002 — 登录错误映射', () => {
  it('凭据错（CredentialsSignin / 401）→ 与 authorize 同一句文案（同源常量）', () => {
    expect(loginErrorMessage({ error: 'CredentialsSignin' })).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
    expect(loginErrorMessage({ error: 'x', status: 401 })).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
    expect(AUTH_FORM_MESSAGES.invalidCredentials).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it('限速（429 / rate_limited）优先于凭据错——限速时根本没走到凭据判定', () => {
    expect(loginErrorMessage({ status: 429 })).toBe(
      AUTH_FORM_MESSAGES.rateLimited,
    );
    expect(
      loginErrorMessage({ error: 'CredentialsSignin', code: 'rate_limited' }),
    ).toBe(AUTH_FORM_MESSAGES.rateLimited);
    expect(
      loginErrorMessage({ error: 'CredentialsSignin', status: 429 }),
    ).not.toBe(AUTH_FORM_MESSAGES.invalidCredentials);
  });

  it('网络中断 / 未知错误 → 兜底文案，绝不把原始错误码丢给用户', () => {
    expect(loginErrorMessage(null)).toBe(AUTH_FORM_MESSAGES.loginFailed);
    expect(loginErrorMessage({ error: 'Configuration' })).toBe(
      AUTH_FORM_MESSAGES.loginFailed,
    );
    expect(ALL_AUTH_FORM_MESSAGES).not.toContain('CredentialsSignin');
  });

  it('任何映射结果都在封闭文案集合内（浏览器断言据此判定）', () => {
    for (const result of [
      null,
      { error: 'CredentialsSignin' },
      { status: 429 },
      { error: 'Configuration' },
      {},
    ]) {
      expect(ALL_AUTH_FORM_MESSAGES).toContain(loginErrorMessage(result));
    }
  });
});

describe('M5-AUTH-RLS F002 — 注册错误映射（端点由 F005 实装）', () => {
  it('404 / 501（端点尚未就绪）→ 明示未就绪，而不是「注册失败」误导', () => {
    expect(registerErrorMessage(404)).toBe(
      AUTH_FORM_MESSAGES.registerUnavailable,
    );
    expect(registerErrorMessage(501)).toBe(
      AUTH_FORM_MESSAGES.registerUnavailable,
    );
  });

  it('429 → 限速文案', () => {
    expect(registerErrorMessage(429)).toBe(AUTH_FORM_MESSAGES.rateLimited);
  });

  it('4xx 带服务端文案（如邮箱已注册）→ 原样透出给用户', () => {
    expect(registerErrorMessage(409, '该邮箱已注册')).toBe('该邮箱已注册');
  });

  it('5xx → 兜底文案（不透服务端内部细节）', () => {
    expect(registerErrorMessage(500, 'PrismaClientKnownRequestError: P2002')).toBe(
      AUTH_FORM_MESSAGES.registerFailed,
    );
  });
});

describe('M5-AUTH-RLS F002 — 前置校验（服务端仍是权威）', () => {
  it('登录：空字段 / 坏邮箱各有专属文案', () => {
    expect(validateLoginForm({ email: '', password: '' })).toBe(
      AUTH_FORM_MESSAGES.missingFields,
    );
    expect(validateLoginForm({ email: 'not-an-email', password: 'x' })).toBe(
      AUTH_FORM_MESSAGES.invalidEmail,
    );
    expect(
      validateLoginForm({ email: 'a@b.co', password: 'anything' }),
    ).toBeNull();
  });

  it('注册：口令强度 = D-4（≥10 位 + 字母 + 数字）', () => {
    expect(isStrongPassword('Short1')).toBe(false);
    expect(isStrongPassword('alllettersonly')).toBe(false);
    expect(isStrongPassword('1234567890')).toBe(false);
    expect(isStrongPassword('DevPassw0rd2026')).toBe(true);
    expect(isStrongPassword('abcdefghi1')).toBe(true);
  });

  it('注册：缺团队名 / 弱口令各有专属文案，合法输入放行', () => {
    expect(
      validateSignupForm({
        tenantName: '',
        email: 'a@b.co',
        password: 'DevPassw0rd2026',
      }),
    ).toBe(AUTH_FORM_MESSAGES.missingTenantName);
    expect(
      validateSignupForm({
        tenantName: '星轨工作室',
        email: 'a@b.co',
        password: 'weak',
      }),
    ).toBe(AUTH_FORM_MESSAGES.weakPassword);
    expect(
      validateSignupForm({
        tenantName: '星轨工作室',
        email: 'a@b.co',
        password: 'DevPassw0rd2026',
      }),
    ).toBeNull();
  });
});
