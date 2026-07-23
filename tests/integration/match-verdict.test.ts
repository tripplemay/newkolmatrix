// M2-B-CREATORS F006 — 人工裁定写入口集成测试（打真库，D20 变异测试义务）。
//
// 变异断言设计：
// 1. pending → kept / dropped 合法流转（杀「写入口失效」变异）；
// 2. kept ↔ dropped 改判合法（人工纠错语义，杀「终态锁死」变异）；
// 3. 幂等同值重放：changed=false 且 updatedAt 不变（杀「重放重写」变异）；
// 4. 不存在 → NOT_FOUND（杀「静默吞」变异）；publicId 双口径；
// 5. P4 回归：裁定后 generateCandidates 刷新不回退（M2-A 保护跨批仍活）；
// 6. 读侧联动：裁定后 loadMatchSurfaceData 待裁定表离表（kept/dropped 均离）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { setCandidateVerdict } from '../../src/lib/match/verdict';
import { generateCandidates } from '../../src/lib/match/generate-candidates';
import { loadMatchSurfaceData } from '../../src/lib/match/surface-data';

const FIXTURE_SLUG = `test-tenant-m2b-verdict-${process.pid}`;
const DIMS = 1024;

let tenantId: string;
let projectId: string;
let kolId: string;
let candidateId: string;
let candidatePublicId: string;

const mockEmbed = async (): Promise<number[]> => {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = 1;
  return v;
};

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2B verdict 集成测试夹具租户' },
  });
  tenantId = t.id;

  const p = await prisma.project.create({
    data: { tenantId, name: 'M2B F006 夹具项目', cur: 'match', maxReached: 'match' },
  });
  projectId = p.id;

  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: 'm2b-f006-kol',
      displayName: '裁定夹具 KOL',
      platform: 'youtube',
      followers: 10_000,
    },
  });
  kolId = k.id;
  await prisma.$executeRawUnsafe(
    `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
    `[${(await mockEmbed()).join(',')}]`,
    kolId,
  );

  // 经真实生成路径产生候选（scorePending → doubts 非空 → 上待裁定表）
  await generateCandidates(projectId, { embed: mockEmbed });
  const c = await prisma.matchCandidate.findUniqueOrThrow({
    where: { projectId_kolId: { projectId, kolId } },
  });
  candidateId = c.id;
  candidatePublicId = c.publicId;
  expect(c.verdict).toBe('pending');
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('setCandidateVerdict 流转（D20）', () => {
  it('pending → kept 合法（变异断言 1）；读侧联动：待裁定表离表（断言 6）', async () => {
    const before = await loadMatchSurfaceData(projectId, 'match');
    expect(before.candidates.some((c) => c.id === candidateId)).toBe(true);

    const r = await setCandidateVerdict(tenantId, candidateId, 'kept');
    expect(r).toEqual({ ok: true, id: candidateId, verdict: 'kept', changed: true });

    const after = await loadMatchSurfaceData(projectId, 'match');
    expect(after.candidates.some((c) => c.id === candidateId)).toBe(false);
  });

  it('kept → dropped 改判合法（变异断言 2）；publicId 双口径（断言 4b）', async () => {
    const r = await setCandidateVerdict(tenantId, candidatePublicId, 'dropped');
    expect(r).toMatchObject({ ok: true, verdict: 'dropped', changed: true });
    const row = await prisma.matchCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });
    expect(row.verdict).toBe('dropped');
  });

  it('幂等同值重放：changed=false 且 updatedAt 不变（变异断言 3）', async () => {
    const before = await prisma.matchCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });
    const r = await setCandidateVerdict(tenantId, candidateId, 'dropped');
    expect(r).toMatchObject({ ok: true, changed: false });
    const after = await prisma.matchCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('不存在 → NOT_FOUND（变异断言 4）', async () => {
    const r = await setCandidateVerdict(tenantId, 'nonexistent', 'kept');
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('P4 回归（变异断言 5）：裁定后刷新不回退 dropped', async () => {
    await generateCandidates(projectId, { embed: mockEmbed });
    const row = await prisma.matchCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });
    expect(row.verdict).toBe('dropped'); // M2-A upsert 保护跨批仍活
  });
});
