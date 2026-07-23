// M2-C-AGENT-HONESTY F005 — 项目创建端到端闭环集成测试（打真库，夹具租户）。
//
// 用户问题的正面消解链一次钉死：
//   executeTool('create_project')（orchestrator ctx，对话路径）
//   → Project 落库（cur=brief）
//   → OperationLog 留痕（雷达/记录页数据源）
//   → 列表数据层可见（campaigns RSC 同款查询口径）
//   → 详情页三口径可达（id/publicId 解析，campaigns/[id] 同款 OR 查询）
// F001 已验服务/工具行为面；本套件验「用户在界面上看得见」的读侧贯通。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../../src/lib/agent/tools';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import type { CreateProjectToolOutput } from '../../src/lib/agent/tools/create-project';

const FIXTURE_SLUG = `test-tenant-m2c-e2e-${process.pid}`;

let tenantId: string;
let created: NonNullable<CreateProjectToolOutput['project']>;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2C e2e 集成测试夹具租户' },
  });
  tenantId = t.id;

  const r = await executeTool(
    'create_project',
    { name: '端到端·东南亚推广', market: '东南亚' },
    { tenantId, agentId: 'orchestrator' },
  );
  const out = r.output as CreateProjectToolOutput;
  expect(out.created).toBe(true);
  created = out.project!;
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('对话创建 → 界面可见 全链路', () => {
  it('列表数据层可见（campaigns RSC 同款查询口径：tenant findMany）', async () => {
    const rows = await prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.name)).toContain('端到端·东南亚推广');
    const row = rows.find((r) => r.id === created.id)!;
    expect(row.cur).toBe('brief'); // 「停在「目标 Brief」」卡片语义的数据源
    expect(row.market).toBe('东南亚');
  });

  it('详情页三口径可达（campaigns/[id] 同款 OR 解析：id 与 publicId）', async () => {
    for (const ref of [created.id, created.publicId]) {
      const hit = await prisma.project.findFirst({
        where: {
          tenantId,
          OR: [{ slug: ref }, { id: ref }, { publicId: ref }],
        },
      });
      expect(hit?.id, `ref=${ref}`).toBe(created.id);
    }
  });

  it('雷达留痕可见（今天页/记录页数据源：OperationLog kind=auto + actor=人格）', async () => {
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, projectId: created.id, kind: 'auto' },
    });
    expect(log).not.toBeNull();
    expect(log!.actor).toBe('orchestrator'); // 对话路径的真实署名
    expect(log!.summary).toContain('端到端·东南亚推广');
    expect(log!.payloadJson).toMatchObject({ action: 'project.created' });
  });

  it('幻觉反例复核：未经工具的「编排」不产生任何落库（对照面）', async () => {
    // 本夹具租户内除上述创建外零其他写入——「说了≠做了」的系统事实面
    expect(await prisma.project.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(0);
  });
});
