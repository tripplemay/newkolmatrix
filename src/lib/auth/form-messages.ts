// M5-AUTH-RLS F002 — 登录/注册表单的用户可读文案与前端校验（纯函数，UI 只做渲染）。
//
// 为什么抽出来：acceptance 要「表单错误态（401 / 限速 / 校验失败）有用户可读文案」。
// 把映射写死在 JSX 里就只能靠肉眼验；抽成纯函数后错误映射本身能被单测逐条钉，
// 浏览器侧只需证明「确实渲染出了这套文案里的一条」。
//
// 边界：**前端校验只为 UX**，权威校验在服务端（登录 = F001 authorize；注册 = F005 端点 zod）。
// 前端放行不等于服务端放行，反之亦然——任何一侧单独收紧都不会造成安全洞。

import { INVALID_CREDENTIALS_MESSAGE } from './credentials';

export const AUTH_FORM_MESSAGES = {
  /** 401 语义：凭据不对（错口令 / 用户不存在同文，防用户存在性泄露）。 */
  invalidCredentials: INVALID_CREDENTIALS_MESSAGE,
  /** 429：F006 的 fail-closed 限速命中。 */
  rateLimited: '尝试过于频繁，请稍后再试',
  /** 校验：必填缺失。 */
  missingFields: '请填写邮箱和密码',
  missingTenantName: '请填写团队名称',
  invalidEmail: '请输入有效的邮箱地址',
  /** 校验：注册需勾选条款。 */
  missingTerms: '请先勾选同意服务条款与隐私政策',
  /** 校验：D-4 口令强度（≥10 位且含字母与数字）。 */
  weakPassword: '密码至少 10 位，且需同时包含字母和数字',
  /** 注册端点尚未实装（F005 接管后不再出现）。 */
  registerUnavailable: '注册服务尚未就绪，请稍后再试',
  /** 兜底：网络中断 / 5xx / 未知错误。 */
  loginFailed: '登录失败，请稍后重试',
  registerFailed: '注册失败，请稍后重试',
} as const;

/** 表单能显示的全部文案（浏览器实测断言用的封闭集合）。 */
export const ALL_AUTH_FORM_MESSAGES: readonly string[] =
  Object.values(AUTH_FORM_MESSAGES);

export interface SignInLikeResult {
  error?: string | null;
  code?: string | null;
  status?: number | null;
}

/**
 * next-auth `signIn(..., { redirect: false })` 结果 → 用户可读文案。
 *
 * 429 优先于凭据错：限速命中时根本没走到凭据判定，说「邮箱或密码不正确」是误导。
 */
export function loginErrorMessage(result: SignInLikeResult | null): string {
  if (!result) return AUTH_FORM_MESSAGES.loginFailed;
  if (result.status === 429 || result.code === 'rate_limited') {
    return AUTH_FORM_MESSAGES.rateLimited;
  }
  if (result.error === 'CredentialsSignin' || result.status === 401) {
    return AUTH_FORM_MESSAGES.invalidCredentials;
  }
  if (result.error) return AUTH_FORM_MESSAGES.loginFailed;
  return AUTH_FORM_MESSAGES.loginFailed;
}

/** 注册端点 HTTP 状态 → 用户可读文案（端点由 F005 实装，本批只做壳）。 */
export function registerErrorMessage(
  status: number,
  serverMessage?: string | null,
): string {
  if (status === 429) return AUTH_FORM_MESSAGES.rateLimited;
  if (status === 404 || status === 501) {
    return AUTH_FORM_MESSAGES.registerUnavailable;
  }
  // 4xx 带服务端明示文案（如邮箱已注册）时原样透出——这类不是敏感信息，且用户需据此改输入
  if (status >= 400 && status < 500 && serverMessage) return serverMessage;
  return AUTH_FORM_MESSAGES.registerFailed;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** D-4 口令强度：≥10 位且同时含字母与数字（与 F005 服务端 zod 同一口径）。 */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password)
  );
}

/** 登录表单前置校验：返回文案表示不通过，null 表示可提交。 */
export function validateLoginForm(input: {
  email: string;
  password: string;
}): string | null {
  if (!input.email.trim() || !input.password) {
    return AUTH_FORM_MESSAGES.missingFields;
  }
  if (!EMAIL_SHAPE.test(input.email.trim())) {
    return AUTH_FORM_MESSAGES.invalidEmail;
  }
  return null;
}

/** 注册表单前置校验。口令强度在此就拦一道，省一次注定失败的往返。 */
export function validateSignupForm(input: {
  tenantName: string;
  email: string;
  password: string;
}): string | null {
  if (!input.tenantName.trim()) return AUTH_FORM_MESSAGES.missingTenantName;
  if (!input.email.trim() || !input.password) {
    return AUTH_FORM_MESSAGES.missingFields;
  }
  if (!EMAIL_SHAPE.test(input.email.trim())) {
    return AUTH_FORM_MESSAGES.invalidEmail;
  }
  if (!isStrongPassword(input.password)) {
    return AUTH_FORM_MESSAGES.weakPassword;
  }
  return null;
}
