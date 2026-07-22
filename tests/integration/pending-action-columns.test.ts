// M1-C F002 — PendingAction 扩列（projectId/agentId）集成测试（打真库）。
//
// 为什么是集成测试：要验的是「创建点把 ToolContext 上下文落进新列」与
// 「aggregatePending 把新列原样带回」——列存在性与往返只有真库能证。
//
// 夹具自建自清（同 env-advance 范式），不依赖 seed、不污染 dev 数据。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { createPendingAction } from '../../src/lib/agent/gate/gate';
import { aggregatePending } from '../../src/lib/agent/orchestrator';
import type { Harm } from '../../src/lib/agent/gate/harm';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-pending-cols-${process.pid}`;

let tenantId: string;

const HARM: Harm = {
  action: 'test_send',
  summary: '集成测试 harm',
  targets: ['x'],
  irreversible: true,
  evidence: 'fixture',
  expiresAt: '',
  label: '对外·不可撤销',
};

function ctxWith(projectId: string | null): ToolContext {
  return {
    tenantId,
    agentId: 'reach',
    projectId,
    env: 'default',
  };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'pending 扩列集成测试夹具' },
    select: { id: true },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('PendingAction projectId/agentId 扩列（M1-C F002，D-A）', () => {
  it('创建点带 ctx.projectId → 两列落值', async () => {
    const env = await createPendingAction(
      'send_outreach',
      { to: 'kol-1' },
      HARM,
      ctxWith('proj-fixture-1'),
    );
    const row = await prisma.pendingAction.findUniqueOrThrow({
      where: { id: env.pendingActionId },
      select: { projectId: true, agentId: true },
    });
    expect(row.projectId).toBe('proj-fixture-1');
    expect(row.agentId).toBe('reach');
  });

  it('创建点无 projectId → projectId=null 合法（只填不判）', async () => {
    const env = await createPendingAction(
      'send_outreach',
      { to: 'kol-2' },
      HARM,
      ctxWith(null),
    );
    const row = await prisma.pendingAction.findUniqueOrThrow({
      where: { id: env.pendingActionId },
      select: { projectId: true, agentId: true },
    });
    expect(row.projectId).toBeNull();
    expect(row.agentId).toBe('reach');
  });

  it('aggregatePending 原样带回新字段（harm 仍透传不改写）', async () => {
    const items = await aggregatePending(ctxWith(null));
    expect(items.length).toBe(2);
    const withProject = items.find((i) => i.projectId === 'proj-fixture-1');
    const withoutProject = items.find((i) => i.projectId === null);
    expect(withProject).toBeDefined();
    expect(withoutProject).toBeDefined();
    expect(withProject?.agentId).toBe('reach');
    // harm 原样透传（编排层不改写闸门结论）
    expect((withProject?.harm as Harm).summary).toBe('集成测试 harm');
  });
});
