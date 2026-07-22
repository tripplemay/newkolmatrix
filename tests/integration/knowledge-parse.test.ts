// M1-D-KNOWLEDGE F003 — 解析管道状态机集成测试（D20 变异测试义务，打真库 + mock 网关 P7）。
//
// 变异断言设计（每条都能杀死一类状态机变异）：
// 1. 四态流转：中途断言 parsing（杀「跳过中间态」变异）+ 终态 parsed/parsedAt（杀「终态错置」）；
// 2. 失败消化：坏输出 → failed + parseError 且不抛错（杀「异常外抛/静默吞」变异）；
// 3. supersede 链方向：旧头.supersededById → 新头 id（杀「链方向反转」变异）；
// 4. 链头读取：恒取 supersededById IS NULL（杀「读到被取代旧知识」变异）；
// 5. 防重入：in-flight 中二次触发拒（杀「并发双跑」变异）；
// 6. failed 可重试回 parsing → parsed（杀「failed 终态锁死」变异）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { prisma } from '../../src/lib/db/prisma';
import { saveMaterialFile } from '../../src/lib/knowledge/storage';
import {
  parseMaterial,
  resetParseInFlight,
  type LlmCaller,
} from '../../src/lib/knowledge/parse';
import { getKnowledgeHeads } from '../../src/lib/knowledge/query';

let materialsDir: string;
let tenantId: string;
let gameId: string;
let createdDevTenant = false;

const GOOD_OUTPUT = JSON.stringify({
  selling_points: ['双武器切换'],
  audience_slices: [{ label: '硬核射击', percent: 58 }],
  compliance_redlines: ['#ad 披露'],
  confidence: 0.8,
});

const GOOD_OUTPUT_V2 = JSON.stringify({
  selling_points: ['赛季通行证'],
  audience_slices: [{ label: '竞技向', percent: 40 }],
  compliance_redlines: ['实机须真实版本'],
  confidence: 0.9,
});

/** 建一份 txt 素材（真落盘 + 真落库），返回 materialId。 */
async function makeTextMaterial(content: string): Promise<string> {
  const saved = await saveMaterialFile(gameId, 'fixture.txt', Buffer.from(content));
  const m = await prisma.material.create({
    data: {
      id: saved.id,
      tenantId,
      gameId,
      type: 'lore',
      source: '你上传',
      fileName: 'fixture.txt',
      storageRef: saved.storageRef,
      mimeType: 'text/plain',
      sizeBytes: content.length,
    },
  });
  return m.id;
}

const llmReturning =
  (text: string): LlmCaller =>
  async () =>
    text;

beforeAll(async () => {
  materialsDir = mkdtempSync(path.join(tmpdir(), 'm1d-parse-'));
  process.env.MATERIALS_DIR = materialsDir;
  resetParseInFlight();

  const existing = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (existing) {
    tenantId = existing.id;
  } else {
    const t = await prisma.tenant.create({
      data: { slug: 'dev', name: 'dev tenant（F003 集成测试夹具建）' },
    });
    tenantId = t.id;
    createdDevTenant = true;
  }
  const game = await prisma.game.create({
    data: { tenantId, name: 'F003 解析管道夹具游戏' },
  });
  gameId = game.id;
});

afterAll(async () => {
  await prisma.gameKnowledge.deleteMany({ where: { gameId } });
  await prisma.material.deleteMany({ where: { gameId } });
  await prisma.game.deleteMany({ where: { id: gameId } });
  if (createdDevTenant) {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.$disconnect();
  delete process.env.MATERIALS_DIR;
  rmSync(materialsDir, { recursive: true, force: true });
});

describe('四态流转（变异断言 1）', () => {
  it('pending → parsing（中途实测）→ parsed + parsedAt + 知识落库 + FR-11.9 溯源', async () => {
    const id = await makeTextMaterial('星轨协议：双武器实时切换，硬核 PVP。');

    let statusDuringLlm: string | null = null;
    const spyLlm: LlmCaller = async () => {
      const row = await prisma.material.findUniqueOrThrow({ where: { id } });
      statusDuringLlm = row.parseStatus; // 杀「跳过 parsing 中间态」变异
      return GOOD_OUTPUT;
    };

    const result = await parseMaterial(id, { llm: spyLlm });
    expect(result.ok).toBe(true);
    expect(statusDuringLlm).toBe('parsing');

    const row = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(row.parseStatus).toBe('parsed');
    expect(row.parsedAt).not.toBeNull();
    expect(row.parseError).toBeNull();

    const knowledge = await prisma.gameKnowledge.findMany({
      where: { gameId, sourceMaterialIds: { has: id } },
    });
    expect(knowledge.length).toBe(3); // 三类各一行
    for (const k of knowledge) {
      expect(k.sourceMaterialIds).toEqual([id]); // FR-11.9 非空溯源
      expect(k.generatedBy).toBe('strategy');
      expect(k.confidence).toBe(0.8);
    }
  });
});

describe('失败消化（变异断言 2）', () => {
  it('LLM 输出垃圾 → failed + parseError，零知识行，不抛错', async () => {
    const id = await makeTextMaterial('内容');
    const result = await parseMaterial(id, {
      llm: llmReturning('我不会输出 JSON'),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe('PARSE_FAILED');

    const row = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(row.parseStatus).toBe('failed');
    expect(row.parseError).toContain('schema');
    expect(
      await prisma.gameKnowledge.count({
        where: { sourceMaterialIds: { has: id } },
      }),
    ).toBe(0);
  });

  it('三类全空 → failed 明示「未提炼出知识」（不产空知识）', async () => {
    const id = await makeTextMaterial('无信息内容');
    await parseMaterial(id, {
      llm: llmReturning(
        JSON.stringify({ selling_points: [], audience_slices: [], compliance_redlines: [] }),
      ),
    });
    const row = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(row.parseStatus).toBe('failed');
    expect(row.parseError).toContain('提炼');
  });

  it('LLM 抛错（网关故障形）→ failed + parseError 明示，不外抛', async () => {
    const id = await makeTextMaterial('内容');
    const boom: LlmCaller = async () => {
      throw new Error('gateway 500');
    };
    await expect(parseMaterial(id, { llm: boom })).resolves.toMatchObject({
      ok: false,
      code: 'PARSE_FAILED',
    });
    const row = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(row.parseStatus).toBe('failed');
    expect(row.parseError).toContain('模型调用失败');
  });

  it('素材不存在 → NOT_FOUND（不触库不触盘）', async () => {
    const result = await parseMaterial('ck0000000000000000000404');
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('supersede 链 + 链头读取（变异断言 3/4）——独立游戏隔离', () => {
  let chainGameId: string;
  let m1: string;
  let m2: string;

  beforeAll(async () => {
    const g = await prisma.game.create({
      data: { tenantId, name: 'F003 supersede 链夹具游戏' },
    });
    chainGameId = g.id;
    const s1 = await saveMaterialFile(chainGameId, 'v1.txt', Buffer.from('v1'));
    const s2 = await saveMaterialFile(chainGameId, 'v2.txt', Buffer.from('v2'));
    const rows = await Promise.all(
      [s1, s2].map((s, i) =>
        prisma.material.create({
          data: {
            id: s.id,
            tenantId,
            gameId: chainGameId,
            type: 'lore',
            fileName: `v${i + 1}.txt`,
            storageRef: s.storageRef,
            mimeType: 'text/plain',
            sizeBytes: 2,
          },
        }),
      ),
    );
    m1 = rows[0].id;
    m2 = rows[1].id;
  });

  afterAll(async () => {
    await prisma.gameKnowledge.deleteMany({ where: { gameId: chainGameId } });
    await prisma.material.deleteMany({ where: { gameId: chainGameId } });
    await prisma.game.deleteMany({ where: { id: chainGameId } });
  });

  it('二次解析：旧链头 supersededById → 新链头 id（方向断言）；链头读取只回新条目', async () => {
    await parseMaterial(m1, { llm: llmReturning(GOOD_OUTPUT) });
    await parseMaterial(m2, { llm: llmReturning(GOOD_OUTPUT_V2) });

    // 每 kind 两行：旧行被取代、新行为链头
    for (const kind of ['selling_point', 'audience', 'compliance_redline'] as const) {
      const rows = await prisma.gameKnowledge.findMany({
        where: { gameId: chainGameId, kind },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.length).toBe(2);
      const [oldRow, newRow] = rows;
      expect(oldRow.supersededById).toBe(newRow.id); // 杀「链方向反转」变异
      expect(newRow.supersededById).toBeNull(); // 新行是链头
    }

    // 链头读取恒取 supersededById IS NULL（杀「读到旧知识」变异）
    const heads = await getKnowledgeHeads(chainGameId);
    expect(heads.length).toBe(3);
    expect(heads.every((h) => h.supersededById === null)).toBe(true);
    expect(heads.find((h) => h.kind === 'selling_point')!.content).toBe('赛季通行证');
    expect(
      heads.every((h) => h.sourceMaterialIds.includes(m2)),
    ).toBe(true);
  });

  it('链头读取 kinds 过滤：只取指定类', async () => {
    const heads = await getKnowledgeHeads(chainGameId, ['audience']);
    expect(heads.length).toBe(1);
    expect(heads[0].kind).toBe('audience');
  });
});

describe('防重入 + 重试语义（变异断言 5/6）', () => {
  it('in-flight 中二次触发 → ALREADY_PARSING 拒（不双跑）', async () => {
    const id = await makeTextMaterial('并发夹具');
    let release: (v: string) => void;
    const gate = new Promise<string>((r) => {
      release = r;
    });
    const slowLlm: LlmCaller = () => gate;

    const first = parseMaterial(id, { llm: slowLlm });
    // 等首个调用进入 in-flight（微任务推进）
    await new Promise((r) => setTimeout(r, 20));
    const second = await parseMaterial(id, { llm: llmReturning(GOOD_OUTPUT) });
    expect(second).toMatchObject({ ok: false, code: 'ALREADY_PARSING' });

    release!(GOOD_OUTPUT);
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
  });

  it('failed 可重试回 parsing → parsed（failed 非终态锁死）', async () => {
    const id = await makeTextMaterial('重试夹具');
    await parseMaterial(id, { llm: llmReturning('垃圾') });
    expect(
      (await prisma.material.findUniqueOrThrow({ where: { id } })).parseStatus,
    ).toBe('failed');

    const retry = await parseMaterial(id, { llm: llmReturning(GOOD_OUTPUT) });
    expect(retry.ok).toBe(true);
    const row = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(row.parseStatus).toBe('parsed');
    expect(row.parseError).toBeNull();
  });
});
