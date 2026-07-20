// AGENT-FOUNDATION F005 — ToolContext 工厂（单租户，D4）
//
// 本批单租户（硬编码 dev tenant，slug='dev'，F004 seed）。真实认证/多租户/RLS → M5。
// buildToolContext 是「传输入口 → 领域执行」的适配点：HTTP route 调它拿 ctx；
// 未来 MCP server / agent API 适配层同样调它（D-INTEROP：executeTool 不假设调用方）。

import { prisma } from 'lib/db/prisma';
import { DEFAULT_AGENT_ID, type AgentId } from './registry';
import type { ToolContext } from './tools/types';

export const DEV_TENANT_SLUG = 'dev';

let _devTenantId: string | null = null;

/** 解析并缓存 dev tenant id（F004 已 seed slug='dev'）。 */
export async function getDevTenantId(): Promise<string> {
  if (_devTenantId) return _devTenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEV_TENANT_SLUG },
  });
  if (!tenant) {
    throw new Error(
      `[agent] 未找到 dev tenant（slug=${DEV_TENANT_SLUG}）。请先跑 npm run seed:kol 灌数据（F004）。`,
    );
  }
  _devTenantId = tenant.id;
  return _devTenantId;
}

/** 构造工具执行上下文。EXTENSION POINT：M5 起从认证会话解析真实 tenant/actor。 */
export interface BuildContextOpts {
  agentId?: AgentId;
  projectId?: string | null;
  env?: 'default' | 'sandbox' | 'production';
}

export async function buildToolContext(
  opts: BuildContextOpts = {},
): Promise<ToolContext> {
  const tenantId = await getDevTenantId();
  return {
    tenantId,
    agentId: opts.agentId ?? DEFAULT_AGENT_ID,
    projectId: opts.projectId ?? null,
    env: opts.env ?? 'default',
  };
}
