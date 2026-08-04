// M5-AUTH-RLS F012（spec D-8）— 测试面登录态的**单一真相源**。
//
// F003 的 middleware 落地后，/admin/* 与 /preview/* 未登录一律 307 → /login，
// 既有 playwright 套件与两套 e2e 因此全部需要一份「已登录」的前置。这里是那份前置的共同底座，
// 三个消费方共用同一套凭据解析与失败文案：
//   1. tests/visual/auth.setup.ts —— playwright setup 项目：浏览器里真登录一次 → 落 storageState
//   2. scripts/test/agentloop-e2e.ts / frontdesk-e2e.ts —— 进程内 e2e：走**真 authorize 路径**的登录步
//   3. tests/unit/e2e-auth-session.test.ts —— 把失败路径钉成行为级断言
//
// 【为什么判定不写在脚本里】scripts/ 不在 vitest 收集范围内，写在脚本里的 if 等于没有守门
//（与 src/lib/auth/dev-seed.ts 同一分层理由：判定进可被单测直驱的模块，脚本只做拆装）。
//
// 【为什么默认依赖是懒加载的】默认凭据校验依赖取自**生产装配** `lib/auth` 的
// `prismaAuthorizeDeps`——不另抄一份 Prisma + bcrypt 接线，避免「两份清单各写各的」漂移。
// 但 `lib/auth` 会在模块顶层建 NextAuth 实例，单测不该为了注入假依赖而把它拖进来，
// 故只在**未注入依赖**时才 `await import(...)`。

import {
  authorizeCredentials,
  type AuthorizeDeps,
} from '../../src/lib/auth/credentials';
import { resolveDevTestUserCredentials } from '../../src/lib/auth/dev-seed';

/**
 * storageState 落点。生成产物，不入 git（.gitignore `/tests/.auth/`，repo-hygiene 单测钉）。
 * 可用 PW_STORAGE_STATE 覆盖——并发跑多份实例（如多个 evaluator 共用一台机器）时各存各的。
 */
export const STORAGE_STATE_PATH =
  process.env.PW_STORAGE_STATE?.trim() || 'tests/.auth/storage-state.json';

/**
 * Auth.js v5 会话 cookie 名。http 面（本机 / CI 的 127.0.0.1）用前者，
 * https 面用 __Secure- 前缀；两者都认，避免换环境时静默失守。
 */
export const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
] as const;

export interface StorageStateLike {
  cookies?: Array<{ name: string; value?: string }>;
}

/**
 * storageState 里是否真的有一张非空会话 cookie。
 *
 * 【为什么要单独判这一下】`context.storageState()` 对**没登上**的浏览器同样会写出一个
 * 合法 JSON（cookies: []）。少了这道断言，登录失败会以「文件已生成」的姿态静默通过，
 * 后面 23 条用例再一起以 307 的形式红——首因被埋在最后一层。
 */
export function hasSessionCookie(
  state: StorageStateLike | null | undefined,
): boolean {
  return (state?.cookies ?? []).some(
    (c) =>
      (SESSION_COOKIE_NAMES as readonly string[]).includes(c.name) &&
      (c.value ?? '') !== '',
  );
}

/** 失败文案统一前缀（脚本与 setup 共用，便于人肉 grep 与文档指路）。 */
export const LOGIN_FAILED_PREFIX = '[e2e-auth] 测试登录态不可用';

/**
 * 可执行的修复指引。**绝不含口令本体**（D-4 隐私纪律：口令任何形态都不进日志）。
 * 只给「去哪儿把它补上」，不给「它是什么」。
 */
export function loginFailureHint(email: string): string {
  return [
    `账号：${email}`,
    '排查顺序：',
    '  1. 库里没有这个测试用户或没口令摘要 → `npm run seed:dev-user`（dev 库须先 `npm run db:up` + `npm run db:migrate`）',
    '  2. 口令被 DEV_TEST_USER_PASSWORD 覆盖成了别的值 → 让 seed 与运行侧用同一个值（重跑 seed 即可）',
    '  3. 浏览器侧登录 500 / 无错误文案 → 服务端可能缺 AUTH_SECRET（本机看 .env；CI 看 workflow job env）',
  ].join('\n');
}

export interface E2ESession {
  userId: string;
  email: string;
  tenantId: string;
}

export class E2ESessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2ESessionError';
  }
}

/** 生产装配的凭据依赖（Prisma 查 User + bcrypt 比对）。懒加载，见文件头注释。 */
async function loadProductionAuthorizeDeps(): Promise<AuthorizeDeps> {
  const mod = await import('../../src/lib/auth');
  return mod.prismaAuthorizeDeps;
}

export interface LoginOptions {
  /** 注入凭据依赖（单测用）。不传则用生产装配。 */
  deps?: AuthorizeDeps;
  /** 注入 env（单测用）。 */
  env?: Partial<NodeJS.ProcessEnv>;
}

/**
 * 进程内 e2e 的**登录步**：拿 seed 测试用户的凭据走一遍真 `authorizeCredentials`
 *（与 /api/auth 的 Credentials provider 同一函数、同一依赖装配），成功才返回会话身份。
 *
 * 失败一律抛 E2ESessionError 且**带可执行指引**——这是 acceptance 的负向那条：
 * 没有登录态时脚本必须当场红并说清怎么修，而不是继续跑一遍「什么都没验到」的空流程。
 */
export async function loginE2ESession(
  opts: LoginOptions = {},
): Promise<E2ESession> {
  const { email, password } = resolveDevTestUserCredentials(opts.env);
  const deps = opts.deps ?? (await loadProductionAuthorizeDeps());

  let user: Awaited<ReturnType<typeof authorizeCredentials>>;
  try {
    user = await authorizeCredentials({ email, password }, deps);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new E2ESessionError(
      `${LOGIN_FAILED_PREFIX}：凭据校验过程出错（${reason}）\n${loginFailureHint(email)}`,
    );
  }

  if (!user) {
    throw new E2ESessionError(
      `${LOGIN_FAILED_PREFIX}：凭据校验未通过（用户不存在 / 无口令摘要 / 口令不匹配，三者对外同文）\n${loginFailureHint(
        email,
      )}`,
    );
  }
  return { userId: user.id, email: user.email, tenantId: user.tenantId };
}

/**
 * 会话租户 == 执行上下文租户。
 *
 * F004 落地后的**准确语义**：进程内 e2e 没有 HTTP 会话，ctx 走的是显式路径
 * `systemContext(DEV_TENANT_SLUG)`（脚本自己指名夹具租户）。故本断言比对的是
 * **两个独立来源**——「登录测试用户解析出的租户」与「夹具显式指名的 dev 租户」；
 * 两者漂移（如 seed 用户被建到别的租户）时当场红，而不是让 e2e 拿着 A 的会话去验 B 的数据。
 * 它**不**证明「HTTP 面的 ctx 来自会话」——那条归 route 层，由 middleware（F003）与
 * tests/unit/session-tenant-context.test.ts（F004 负向断言）分别守。
 */
export function assertSessionTenant(
  session: E2ESession,
  ctxTenantId: string,
): void {
  if (session.tenantId !== ctxTenantId) {
    throw new E2ESessionError(
      `${LOGIN_FAILED_PREFIX}：会话租户（${session.tenantId}）≠ 执行上下文租户（${ctxTenantId}）——` +
        '测试跑的不是登录用户的数据，断言结论无效。',
    );
  }
}
