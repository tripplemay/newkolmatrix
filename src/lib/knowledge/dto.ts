// M1-D-KNOWLEDGE F002 — Material 传输形状（route ↔ 前端轮询 ↔ F004 页面契约共用）。
//
// 与 Prisma Material 行的差异：日期序列化为 ISO 串（跨 RSC/route 可序列化），
// 不暴露 storageRef（磁盘布局是服务端内部事，前端只凭 id 与解析状态行事）。

import type { Material } from '@prisma/client';

export interface MaterialDto {
  id: string;
  publicId: string;
  gameId: string;
  type: string;
  source: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  parseStatus: string;
  parseError: string | null;
  parsedAt: string | null;
  createdAt: string;
}

export function toMaterialDto(m: Material): MaterialDto {
  return {
    id: m.id,
    publicId: m.publicId,
    gameId: m.gameId,
    type: m.type,
    source: m.source,
    fileName: m.fileName,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    parseStatus: m.parseStatus,
    parseError: m.parseError,
    parsedAt: m.parsedAt ? m.parsedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}
