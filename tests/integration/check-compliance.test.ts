// M4.5-AGENT-LOOP F011 — check_compliance 工具集成测试（compliance 人格首件）
//
// 覆盖 acceptance：
// - 注册且挂 compliance 人格（tools 空数组起填充，同源断言）；class=internal 无 buildHarm
// - 经既有链头读取器取 compliance_redline（不内联重查，grep 证复用）
// - 输出结构化核查单（红线条目 + 逐条 Material 溯源引用）
// - 无红线知识 / 未关联游戏 → 空态诚实（明示「暂无红线知识」，不编造，不说「合规通过」）
// - 输出 JSON 往返无损；输入契约单测
// - 被取代的旧红线不得出现（链头口径的核心价值）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import {
  COMPLIANCE_NO_GAME_MSG,
  COMPLIANCE_NO_REDLINE_MSG,
  COMPLIANCE_NOT_JUDGED_MSG,
  COMPLIANCE_PROJECT_NOT_FOUND_MSG,
  type CheckComplianceOutput,
} from '../../src/lib/agent/tools/check-compliance';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m45-compliance-${process.pid}`;

let tenantId: string;
let gameId: string;
let materialId: string;
let projWithRedline: string;
let projGameNoKnowledge: string;
let projNoGame: string;
let headKnowledgeId: string;
let ctx: ToolContext;

const HEAD_CONTENT = '不得出现未成年人饮酒画面；#ad 披露须在正文首屏可见';
const SUPERSEDED_CONTENT = '（旧版红线，已被取代——不得出现在核查单里）';

async function run(
  input: Record<string, unknown>,
): Promise<CheckComplianceOutput> {
  const r = await executeTool('check_compliance', input, ctx);
  return r.output as CheckComplianceOutput;
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 合规夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'compliance', projectId: null, env: 'default' };

  const game = await prisma.game.create({
    data: { tenantId, name: '料理次元（合规夹具）' },
  });
  gameId = game.id;

  const material = await prisma.material.create({
    data: {
      tenantId,
      gameId,
      type: 'gameplay_doc',
      fileName: '品牌合规手册.pdf',
      storageRef: `${gameId}/fixture-compliance.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    },
  });
  materialId = material.id;

  // 链头（现行）
  const head = await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'compliance_redline',
      content: HEAD_CONTENT,
      sourceMaterialIds: [material.id],
      confidence: 0.82,
    },
  });
  headKnowledgeId = head.id;
  // 已被取代的旧条目（supersededById 指向链头）——绝不能出现在输出里
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'compliance_redline',
      content: SUPERSEDED_CONTENT,
      sourceMaterialIds: [material.id],
      supersededById: head.id,
    },
  });
  // 无溯源的链头条目（unsourced 如实暴露）
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'compliance_redline',
      content: '素材未覆盖的补充红线（无溯源）',
      sourceMaterialIds: [],
    },
  });
  // 非红线类知识（不得混入）
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'selling_point',
      content: '卖点条目不该出现在合规核查单',
      sourceMaterialIds: [material.id],
    },
  });

  const p1 = await prisma.project.create({
    data: { tenantId, name: '有红线项目', gameId },
  });
  projWithRedline = p1.id;

  const emptyGame = await prisma.game.create({
    data: { tenantId, name: '未解析知识的游戏' },
  });
  const p2 = await prisma.project.create({
    data: { tenantId, name: '有游戏无知识项目', gameId: emptyGame.id },
  });
  projGameNoKnowledge = p2.id;

  const p3 = await prisma.project.create({
    data: { tenantId, name: '未关联游戏项目' },
  });
  projNoGame = p3.id;
});

afterAll(async () => {
  await prisma.gameKnowledge.deleteMany({ where: { tenantId } });
  await prisma.material.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.game.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格绑定（同源断言）', () => {
  it('注册在 native 工具表，class=internal 且无 buildHarm', () => {
    expect(getNativeToolNames()).toContain('check_compliance');
    const def = getTool('check_compliance')!;
    expect(def.class).toBe('internal');
    expect(def.buildHarm).toBeUndefined();
    expect(def.source).toBe('native');
  });

  it('挂 compliance 人格（空数组首次填充），不出现在其他人格子集', () => {
    for (const p of listPersonas()) {
      const has = p.tools.includes('check_compliance');
      expect(has, `persona=${p.id}`).toBe(p.id === 'compliance');
    }
    const compliance = listPersonas().find((p) => p.id === 'compliance')!;
    expect(compliance.tools.length).toBeGreaterThan(0);
  });

  it('internal 直调不产生 PendingAction', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await run({ projectId: projWithRedline });
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });
});

describe('核查单：链头红线 + 逐条溯源', () => {
  it('只出现现行链头的 compliance_redline（旧版与他类知识都不混入）', async () => {
    const out = await run({ projectId: projWithRedline });
    const contents = out.items.map((i) => i.content);
    expect(contents).toContain(HEAD_CONTENT);
    expect(contents).not.toContain(SUPERSEDED_CONTENT); // 链头口径的核心价值
    expect(contents.join('|')).not.toContain('卖点条目');
    expect(out.items).toHaveLength(2);
    expect(out.gameId).toBe(gameId);
    expect(out.gameName).toContain('料理次元');
  });

  it('每条带 Material 溯源引用；无溯源条目如实标 unsourced', async () => {
    const out = await run({ projectId: projWithRedline });
    const head = out.items.find((i) => i.knowledgeId === headKnowledgeId)!;
    expect(head.sources).toEqual([
      { materialId, fileName: '品牌合规手册.pdf' },
    ]);
    expect(head.unsourced).toBe(false);
    expect(head.confidence).toBeCloseTo(0.82);

    const noSource = out.items.find((i) => i.sources.length === 0)!;
    expect(noSource.unsourced).toBe(true);
  });

  it('源码 grep 证：经链头读取器取数，无内联重查', () => {
    const src = readFileSync('src/lib/agent/tools/check-compliance.ts', 'utf8');
    // 只看代码行——注释里为解释纪律而提到这些标识符是允许的
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).toContain('getKnowledgeHeads(');
    expect(code).not.toContain('gameKnowledge.findMany');
    expect(code).not.toContain('supersededById');
  });
});

describe('诚实边界：不给判定、空态不编造', () => {
  it('传了待查文案也恒 verdict=not_judged，且不回传文案正文', async () => {
    const secret = '这段待查文案不应出现在工具产物里';
    const out = await run({ projectId: projWithRedline, text: secret });
    expect(out.verdict).toBe('not_judged');
    expect(out.note).toBe(COMPLIANCE_NOT_JUDGED_MSG);
    expect(out.textProvided).toBe(true);
    expect(out.textLength).toBe(secret.length);
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it('有游戏但无红线知识 → 空清单 + 明示「暂无红线知识」（不说合规通过）', async () => {
    const out = await run({ projectId: projGameNoKnowledge });
    expect(out.items).toEqual([]);
    expect(out.note).toBe(COMPLIANCE_NO_REDLINE_MSG);
    expect(out.note).toContain('不得据此判定');
  });

  it('未关联游戏 → 空清单 + 明示原因（gameId=null 如实透传）', async () => {
    const out = await run({ projectId: projNoGame });
    expect(out.items).toEqual([]);
    expect(out.gameId).toBeNull();
    expect(out.note).toBe(COMPLIANCE_NO_GAME_MSG);
  });
});

describe('输入契约', () => {
  it('projectId 支持 publicId 口径', async () => {
    const p = await prisma.project.findUnique({
      where: { id: projWithRedline },
      select: { publicId: true },
    });
    const out = await run({ projectId: p!.publicId });
    expect(out.projectId).toBe(projWithRedline);
  });

  it('项目不存在 → 明示抛错（不返回空清单冒充「无红线」）', async () => {
    await expect(run({ projectId: 'no-such-project' })).rejects.toThrow(
      COMPLIANCE_PROJECT_NOT_FOUND_MSG,
    );
  });

  it('坏入参被拒（projectId 必填非空）', async () => {
    await expect(run({})).rejects.toThrow(/入参校验失败/);
    await expect(run({ projectId: '' })).rejects.toThrow(/入参校验失败/);
  });

  it('输出 JSON 往返无损', async () => {
    const out = await run({ projectId: projWithRedline });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
