// M1-D-KNOWLEDGE F005 — gameKnowledgeSection 取数链路集成测试（打真库，不打网关）。
//
// 覆盖：Project 三口径解析（id/publicId/slug，沿 compute-health D8 先例）· kinds 过滤 ·
// 链头恒取（superseded 旧行不进 prompt）· 缺失链路各环节 → 空串（D2 不打死对话主链路）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { gameKnowledgeSection } from '../../src/lib/agent/knowledge-context';

let tenantId: string;
let gameId: string;
let projectId: string;
let projectPublicId: string;
let createdDevTenant = false;
const PROJECT_SLUG = `f005-inject-${process.pid}`;

beforeAll(async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (existing) {
    tenantId = existing.id;
  } else {
    const t = await prisma.tenant.create({
      data: { slug: 'dev', name: 'dev tenant（F005 集成测试夹具建）' },
    });
    tenantId = t.id;
    createdDevTenant = true;
  }

  const game = await prisma.game.create({
    data: { tenantId, name: 'F005 注入夹具游戏' },
  });
  gameId = game.id;

  const project = await prisma.project.create({
    data: { tenantId, slug: PROJECT_SLUG, name: 'F005 注入夹具项目', gameId },
  });
  projectId = project.id;
  projectPublicId = project.publicId;

  // 链头知识：audience（现行）+ selling_point（现行）+ 一条被取代的旧 audience（不得进 prompt）
  const newAud = await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: '硬核射击 58%（现行）',
      sourceMaterialIds: ['m-a'],
    },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: '旧受众切片（已取代）',
      sourceMaterialIds: ['m-old'],
      supersededById: newAud.id,
    },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'selling_point',
      content: '双武器切换（卖点）',
      sourceMaterialIds: ['m-a'],
    },
  });
});

afterAll(async () => {
  await prisma.gameKnowledge.deleteMany({ where: { gameId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.game.deleteMany({ where: { id: gameId } });
  if (createdDevTenant) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
});

describe('gameKnowledgeSection（取数 + 过滤 + 降级）', () => {
  it('slug 口径 + kinds=[audience]：只含受众，排除卖点与被取代旧行', async () => {
    const s = await gameKnowledgeSection(PROJECT_SLUG, ['audience']);
    expect(s).toContain('硬核射击 58%（现行）');
    expect(s).not.toContain('双武器切换'); // kinds 过滤
    expect(s).not.toContain('已取代'); // 链头恒取
    expect(s).toContain('F005 注入夹具游戏');
  });

  it('id / publicId 口径与 slug 等价（三口径 OR）', async () => {
    const byId = await gameKnowledgeSection(projectId, ['audience']);
    const byPublic = await gameKnowledgeSection(projectPublicId, ['audience']);
    expect(byId).toContain('硬核射击 58%（现行）');
    expect(byPublic).toContain('硬核射击 58%（现行）');
  });

  it('strategy 三类全量：卖点 + 受众都进段（红线无行则不出现标签行）', async () => {
    const s = await gameKnowledgeSection(PROJECT_SLUG, [
      'selling_point',
      'audience',
      'compliance_redline',
    ]);
    expect(s).toContain('双武器切换（卖点）');
    expect(s).toContain('硬核射击 58%（现行）');
    expect(s).not.toContain('- 合规红线：'); // 无红线链头 → 无该行（不注水）
  });

  it('缺失链路各环节 → 空串：kinds 未声明 / 项目不存在 / 项目未关联游戏', async () => {
    expect(await gameKnowledgeSection(PROJECT_SLUG, undefined)).toBe('');
    expect(await gameKnowledgeSection(PROJECT_SLUG, [])).toBe('');
    expect(await gameKnowledgeSection('no-such-project', ['audience'])).toBe('');

    const orphan = await prisma.project.create({
      data: { tenantId, slug: `${PROJECT_SLUG}-nogame`, name: '无游戏项目' },
    });
    try {
      expect(await gameKnowledgeSection(orphan.id, ['audience'])).toBe('');
    } finally {
      await prisma.project.deleteMany({ where: { id: orphan.id } });
    }
  });
});
