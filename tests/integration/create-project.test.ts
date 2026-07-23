// M2-C-AGENT-HONESTY F001 — createProject 服务集成测试（打真库，夹具租户隔离）。
//
// 断言设计：
// 1. 创建落库：cur/maxReached=brief 默认（P3 不越环节）+ goal 空 + market/game 可选面；
// 2. 留痕原子：OperationLog(kind=auto, actor=调用人格, payloadJson.action='project.created')
//    与 Project 同事务——「创建了」在雷达/记录页看得见（用户问题的正面消解）；
// 3. GAME_NOT_FOUND 明示：未命中不静默不猜、零写入（含零留痕）；
// 4. game 三口径解析（id/publicId/slug）；
// 5. 工具路径：executeTool('create_project') orchestrator ctx 直调 → 同一服务同一行为
//   （F005 端到端的服务层前半，详情页可达性归 F005）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import '../../src/lib/agent/tools'; // native 工具注册（route.ts 同款导入）
import { prisma } from '../../src/lib/db/prisma';
import { createProject } from '../../src/lib/projects/create';
import { executeTool } from '../../src/lib/agent/execute';
import type { CreateProjectToolOutput } from '../../src/lib/agent/tools/create-project';

const FIXTURE_SLUG = `test-tenant-m2c-create-${process.pid}`;

let tenantId: string;
let gameId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2C create 集成测试夹具租户' },
  });
  tenantId = t.id;
  const g = await prisma.game.create({
    data: { tenantId, name: '王者荣耀', slug: `m2c-hok-${process.pid}` },
  });
  gameId = g.id;
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('createProject 服务', () => {
  it('创建落库 + 留痕原子（断言 1/2）：cur=brief、goal 空、log 同事务可见', async () => {
    const r = await createProject(
      tenantId,
      { name: '王者荣耀·东南亚推广', gameIdOrSlug: gameId, market: '东南亚' },
      { actor: 'orchestrator' },
    );
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.project.cur).toBe('brief');

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: r.project.id },
    });
    expect(row.maxReached).toBe('brief');
    expect(row.goal).toBeNull(); // P3：goal 归 brief 环节动线
    expect(row.gameId).toBe(gameId);
    expect(row.market).toBe('东南亚');

    const log = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r.logId },
    });
    expect(log.kind).toBe('auto');
    expect(log.actor).toBe('orchestrator');
    expect(log.projectId).toBe(r.project.id);
    expect(log.payloadJson).toMatchObject({ action: 'project.created' });
    expect(log.summary).toContain('王者荣耀·东南亚推广');
  });

  it('GAME_NOT_FOUND 明示 + 零写入含零留痕（断言 3）', async () => {
    const projectsBefore = await prisma.project.count({ where: { tenantId } });
    const logsBefore = await prisma.operationLog.count({ where: { tenantId } });
    const r = await createProject(
      tenantId,
      { name: '孤儿项目', gameIdOrSlug: 'no-such-game' },
      { actor: 'strategy' },
    );
    expect(r).toEqual({ ok: false, code: 'GAME_NOT_FOUND' });
    expect(await prisma.project.count({ where: { tenantId } })).toBe(projectsBefore);
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(logsBefore);
  });

  it('game 三口径解析（断言 4）：slug 与 publicId 口径均可达', async () => {
    const g = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    for (const ref of [g.slug!, g.publicId]) {
      const r = await createProject(
        tenantId,
        { name: `三口径-${ref.slice(0, 8)}`, gameIdOrSlug: ref },
        { actor: 'operator' },
      );
      expect(r.ok, `ref=${ref}`).toBe(true);
    }
  });

  it('game 省略合法（可空面）：无游戏也能开项目', async () => {
    const r = await createProject(tenantId, { name: '无游戏项目' }, { actor: 'operator' });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const row = await prisma.project.findUniqueOrThrow({ where: { id: r.project.id } });
    expect(row.gameId).toBeNull();
  });
});

describe('工具路径（executeTool 直调，断言 5）', () => {
  it('orchestrator ctx 直调 → created:true + 指路 next + 落库留痕同服务行为', async () => {
    const r = await executeTool(
      'create_project',
      { name: '工具路径项目', market: '东南亚' },
      { tenantId, agentId: 'orchestrator' },
    );
    const out = r.output as CreateProjectToolOutput;
    expect(out.created).toBe(true);
    expect(out.project?.cur).toBe('brief');
    expect(out.next).toContain('目标 Brief');

    const log = await prisma.operationLog.findFirst({
      where: { tenantId, projectId: out.project!.id },
    });
    expect(log?.actor).toBe('orchestrator');
    expect(log?.payloadJson).toMatchObject({ action: 'project.created' });
  });

  it('GAME_NOT_FOUND 经工具路径同样明示不抛错', async () => {
    const r = await executeTool(
      'create_project',
      { name: 'x', gameIdOrSlug: 'ghost' },
      { tenantId, agentId: 'strategy' },
    );
    expect((r.output as CreateProjectToolOutput)).toEqual({
      created: false,
      reason: 'GAME_NOT_FOUND',
    });
  });
});
