// M5-AUTH-RLS F005（spec D-4）— 开放注册：注册即建租户。
//
// 【为什么是「一个事务两张表」】注册的产物是一对不可分割的东西：一个新租户 + 它的第一个用户。
// 建了租户但用户没建成 = 一个永远登不进去、也没人知道它存在的孤儿租户（且它的 name 占着
// 用户以为已经属于自己的名字）；建了用户但租户没建成 = 违反外键。故两者与留痕同事务，
// 要么全成、要么全无。原子性由**行为级测试**证（真库里制造一次插入失败，核证零残留），
// 不靠读代码确认——变异「把建租户挪出事务」会让那条测试红。
//
// 【唯一性由 DB 约束裁定，不做「先查后插」】先查后插是 TOCTOU：两个并发请求都查到「没占用」，
// 然后一起插，靠运气决定谁 500。`User.email` 上有 unique 索引，让它当唯一裁判，
// 撞了就翻译成 409——顺带使原子性测试可以被确定性地驱动（见上）。
//
// 【新租户是空的，这不是缺陷】spec D-4 明示：KOL 池是 per-tenant 的，seed 的 2500 KOL 属 dev 租户。
// 新注册用户首屏看到空态是产品的当前语义（数据获取属另批），不是本 feature 的 bug。

import { z } from 'zod';
// M5.1b F003（spec D-5）— **引导白名单**：注册必须走特权连接。
// 理由：注册要在事务里建 Tenant，而「要建的那个租户」此刻还不存在，无从注入租户变量
//（审计 B2-2 实测：kol_app 下 tenant.create 被 RLS WITH CHECK 拒）。
import { privilegedDb as defaultPrisma } from 'lib/db/privileged';
import { normalizeEmail } from './credentials';
import { hashPassword } from './password';
import {
  AUTH_AUDIT_ACTOR,
  authAuditPayload,
  authAuditSummary,
  emailDomainOf,
} from './audit';

/** spec D-4 定值：≥10 位且同时含字母与数字。与前端 isStrongPassword 同一口径。 */
export const PASSWORD_MIN_LENGTH = 10;

export const WEAK_PASSWORD_MESSAGE = '密码至少 10 位，且需同时包含字母和数字';
export const INVALID_EMAIL_MESSAGE = '请输入有效的邮箱地址';
export const MISSING_TENANT_NAME_MESSAGE = '请填写团队名称';
/**
 * 邮箱已占用的对外文案。
 *
 * 【与登录侧的刻意不对称】登录失败恒用同一句话（防用户名枚举，见 credentials.ts）；
 * 注册**必须**告诉用户这个邮箱不能用，否则他只能反复提交同一份表单。开放注册下这条
 * 枚举面无法消除（任何注册系统都有），故不假装消除它，而是用 fail-closed 限速（F006）
 * 把「可批量刷」压回「一分钟 3 次」。
 */
export const EMAIL_TAKEN_MESSAGE = '该邮箱已注册，请直接登录';

/** 口令强度（导出供前后端与测试共用同一判据）。 */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

export const registerInputSchema = z.object({
  tenantName: z.string().trim().min(1, MISSING_TENANT_NAME_MESSAGE).max(80),
  /** 用户显示名可选（表单有这一格但不强制）。 */
  name: z.string().trim().max(80).optional(),
  email: z.email(INVALID_EMAIL_MESSAGE).max(320),
  // 上限 200：超长串会把 bcrypt 变成 CPU DoS 面（同 credentials.ts 口径）
  password: z.string().max(200).refine(isStrongPassword, WEAK_PASSWORD_MESSAGE),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export interface RegisteredAccount {
  userId: string;
  email: string;
  tenantId: string;
}

export type RegisterResult =
  | { ok: true; account: RegisteredAccount }
  | { ok: false; reason: 'email_taken' };

export interface RegisterDeps {
  /** 注入缝（测试用）：给了就无条件用。缺省 = 生产单例。 */
  db?: typeof defaultPrisma;
  /** 注入缝（测试用）：绕开 cost-12 bcrypt 的 ~250ms，或制造失败路径。 */
  hash?: (plain: string) => Promise<string>;
}

/** Prisma 唯一约束冲突（P2002）且冲突列是 email。 */
function isEmailTakenError(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  const cols = Array.isArray(target) ? target.map(String) : [String(target)];
  return cols.some((c) => c.toLowerCase().includes('email'));
}

/**
 * 注册：事务内建 Tenant + User + 留痕，任一步失败全部回滚。
 *
 * 口令摘要在事务**之外**算：bcrypt cost 12 约 250ms，占着一个 DB 事务不放会把连接池
 * 拖成注册风暴下的瓶颈。摘要本身不依赖事务内的任何值，挪出去无语义损失。
 */
export async function registerAccount(
  input: RegisterInput,
  deps: RegisterDeps = {},
): Promise<RegisterResult> {
  const db = deps.db ?? defaultPrisma;
  const hash = deps.hash ?? hashPassword;

  const email = normalizeEmail(input.email);
  const emailDomain = emailDomainOf(email);
  const passwordHash = await hash(input.password);

  try {
    return await db.$transaction(async (tx) => {
      // slug 留空：注册租户不需要人类可读稳定标识（那是 dev / 系统租户的用途），
      // 且从用户输入派生 slug 会引入撞名与猜测面。对外标识用自动生成的 publicId。
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: input.name || null,
          passwordHash, // 只存摘要（password.ts 铁律）
        },
        select: { id: true, email: true, tenantId: true },
      });
      // 留痕与账号同事务：注册回滚了就不该留下「有人注册成功」的痕迹
      await tx.operationLog.create({
        data: {
          tenantId: tenant.id,
          kind: 'auto',
          actor: AUTH_AUDIT_ACTOR,
          summary: authAuditSummary('register', 'ok', emailDomain),
          payloadJson: authAuditPayload('register', 'ok', emailDomain),
        },
      });
      return {
        ok: true as const,
        account: {
          userId: user.id,
          email: user.email ?? email,
          tenantId: user.tenantId,
        },
      };
    });
  } catch (err) {
    if (isEmailTakenError(err)) return { ok: false, reason: 'email_taken' };
    throw err;
  }
}
