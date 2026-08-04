// AGENT-FOUNDATION F005 — ToolContext 工厂
// M5-AUTH-RLS F004（spec D-3）— EXTENSION POINT 兑现：租户来源从「硬编码 dev」改为「登录会话」。
//
// buildToolContext 是「传输入口 → 领域执行」的适配点：HTTP route / RSC 调它拿 ctx；
// 未来 MCP server / agent API 适配层同样调它（D-INTEROP：executeTool 不假设调用方）。
//
// 【双路收敛（spec D-3）】租户只有两个来源，没有第三条：
//   1. **会话面**（HTTP route + admin page）：`buildToolContext()` 不带租户 → 解析登录会话
//   2. **无会话面**（scheduler / scripts / seed / webhook）：`systemContext(tenantSlug)` 显式指名
// 两条都拿不到 → **抛错**。绝不回落 dev 租户：那等于 A 用户的请求静默落到别人的数据上，
// 而且不报错、不留痕、事后无法从任何日志里发现。负向断言见 tests/unit/session-tenant-context.test.ts。
//
// 【删除模块级缓存】原来那个进程级的 dev 租户 id 缓存变量在多租户下是串数据风险点（M5 侦察点名）：
// 进程内第一个请求解析到的租户会被后续所有请求复用。已删除，不留任何进程级租户状态。

import { prisma } from 'lib/db/prisma';
import { requireSessionIdentity } from 'lib/auth/session-tenant';
import { DEFAULT_AGENT_ID, type AgentId } from './registry';
import type { ToolContext } from './tools/types';

export const DEV_TENANT_SLUG = 'dev';

/** 显式租户路径的默认 actor（无人类操作者时的留痕身份）。 */
export const SYSTEM_ACTOR_PREFIX = 'system:';

/**
 * slug → tenantId。**无缓存**（见文件头「删除模块级缓存」）：每次查库。
 * 调用频次是「每请求一次」量级，且只在显式租户路径上；会话面根本不查这里（租户 id 直接在 JWT 里）。
 */
export async function tenantIdBySlug(slug: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(
      `[agent] 未找到 tenant（slug=${slug}）。dev 库请先跑 npm run seed:kol（F004）灌数据。`,
    );
  }
  return tenant.id;
}

/**
 * dev 租户 id。
 *
 * @deprecated M5-AUTH-RLS F004 起**不是任何请求的租户来源**。HTTP 面走会话
 *（`lib/auth/session-tenant`），无会话面走 `systemContext(DEV_TENANT_SLUG)`。
 * 剩余调用点（scheduler / scripts / seed / 测试夹具）由 F010 收口。
 */
export async function getDevTenantId(): Promise<string> {
  return tenantIdBySlug(DEV_TENANT_SLUG);
}

export interface BuildContextOpts {
  agentId?: AgentId;
  projectId?: string | null;
  env?: 'default' | 'sandbox' | 'production';
  /**
   * **显式租户注入缝**（spec D-3「未显式传租户」的那个「显式」）。
   *
   * 给了就**无条件使用**，不再查会话——同 loop.ts 的 model/ctx 注入缝纪律
   *（M4 教训：不得因「会话恰好存在」而改道，那会让测试测的不是被测对象）。
   *
   * 允许的调用方**只有**：`systemContext`（无会话面的唯一入口）与测试床。
   * **HTTP route / RSC 一律不得传**——传了就等于把租户交给调用方决定，而调用方的入参来自
   * 用户请求，即越权读写。源码级普查钉死：tests/unit/session-tenant-context.test.ts。
   */
  tenantId?: string;
  /** 留痕身份（缺省：会话面 = 登录邮箱；显式面 = system:<slug>）。 */
  actor?: string;
}

/**
 * 构造工具执行上下文。
 *
 * 不带 `tenantId` → 从登录会话解析 `{ tenantId, actor=email }`；**无会话即抛**
 *（`MissingSessionTenantError`）。带 `tenantId` → 无条件使用之。
 */
export async function buildToolContext(
  opts: BuildContextOpts = {},
): Promise<ToolContext> {
  const identity = opts.tenantId
    ? { tenantId: opts.tenantId, actor: opts.actor ?? 'system' }
    : await requireSessionIdentity();
  return {
    tenantId: identity.tenantId,
    actor: opts.actor ?? identity.actor,
    agentId: opts.agentId ?? DEFAULT_AGENT_ID,
    projectId: opts.projectId ?? null,
    env: opts.env ?? 'default',
  };
}

/**
 * 无会话面的**唯一**入口（spec D-3）：按 slug 显式指名租户。
 *
 * scheduler 的例程、scripts/ 的运维与冒烟脚本、seed、以及自鉴权的 webhook
 *（`/api/signals/inbound`，middleware 豁免、无浏览器会话）都走这里。
 * 「显式」的意思是**调用点必须写出租户是谁**——读代码就能看出这段逻辑作用在哪个租户上，
 * 而不是靠一个叫 getDevTenantId 的函数把它藏起来。
 */
export async function systemContext(
  tenantSlug: string,
  opts: Omit<BuildContextOpts, 'tenantId'> = {},
): Promise<ToolContext> {
  const tenantId = await tenantIdBySlug(tenantSlug);
  return buildToolContext({
    ...opts,
    tenantId,
    actor: opts.actor ?? `${SYSTEM_ACTOR_PREFIX}${tenantSlug}`,
  });
}

/** 无会话面只要 tenantId 时的便捷式（等价 `(await systemContext(slug)).tenantId`）。 */
export async function systemTenantId(tenantSlug: string): Promise<string> {
  return tenantIdBySlug(tenantSlug);
}
