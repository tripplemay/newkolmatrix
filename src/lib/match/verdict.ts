// M2-B-CREATORS F006 — 人工裁定服务（verdict 写入口，route 薄封装于此之上）。
//
// internal 动作（D27）：可逆内部判断——kept ↔ dropped 允许改判纠错；幂等同值重放
// 不写库；行内 verdict 即审计（updatedAt 随行）。P4 联动：刷新/例程不回退人工态
//（M2-A generate-candidates upsert 保护，D20 变异锚点在 match-services 套件）。

import { prisma } from 'lib/db/prisma';

export type SetVerdictResult =
  | { ok: true; id: string; verdict: 'kept' | 'dropped'; changed: boolean }
  | { ok: false; code: 'NOT_FOUND' };

export async function setCandidateVerdict(
  tenantId: string,
  idOrPublicId: string,
  verdict: 'kept' | 'dropped',
): Promise<SetVerdictResult> {
  const candidate = await prisma.matchCandidate.findFirst({
    where: { tenantId, OR: [{ id: idOrPublicId }, { publicId: idOrPublicId }] },
    select: { id: true, verdict: true },
  });
  if (!candidate) return { ok: false, code: 'NOT_FOUND' };

  if (candidate.verdict === verdict) {
    return { ok: true, id: candidate.id, verdict, changed: false };
  }
  await prisma.matchCandidate.update({
    where: { id: candidate.id },
    data: { verdict },
  });
  return { ok: true, id: candidate.id, verdict, changed: true };
}
