// M1-D-KNOWLEDGE F002 — 素材上传 / 列表 API。
//
// POST：formData（file + gameId + type）→ 前置校验（白名单 / 20MB / 小图拒，
// f002-smallimage-adjudication）→ 落盘（storage.ts，路径穿越防护）→ Material 落库
// pending（视频族 P6：落库即 failed + parseError 明示）→ 返回 MaterialDto。
// route handler 而非 server action（P1：formData 大文件无 1MB 默认限制 + 与轮询 GET 同域对称）。
//
// GET ?gameId=：该游戏素材列表（前端轮询解析状态用，含 parseStatus/parseError）。
// 运行时 = nodejs（Prisma + 磁盘 IO）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { materialTypeSchema } from 'lib/data/schemas/knowledge';
import { rateLimitUpload } from 'lib/knowledge/rate-limit';
import { saveMaterialFile, removeMaterialFile } from 'lib/knowledge/storage';
import {
  validateUploadFile,
  METADATA_ONLY_PARSE_ERROR,
} from 'lib/knowledge/upload';
import { toMaterialDto } from 'lib/knowledge/dto';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const tenantId = await getDevTenantId();

    // P8：tenantId 维度 10 req/min，fail-open + DISABLE_UPLOAD_RATELIMIT escape
    const limit = rateLimitUpload(tenantId);
    if (!limit.allowed) {
      return Response.json(
        { error: '上传过于频繁，请稍后再试（10 次/分钟）' },
        {
          status: 429,
          headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) },
        },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    const gameId = form.get('gameId');
    const type = form.get('type');

    if (!(file instanceof File)) {
      return Response.json({ error: '缺少 file 字段' }, { status: 400 });
    }
    if (typeof gameId !== 'string' || gameId === '') {
      return Response.json({ error: '缺少 gameId' }, { status: 400 });
    }
    const typeParsed = materialTypeSchema.safeParse(type);
    if (!typeParsed.success) {
      return Response.json(
        { error: `非法素材类型: ${String(type)}` },
        { status: 400 },
      );
    }

    // gameId 必须真实存在且属当前租户（同时天然挡掉路径穿越形状的 gameId——查不到即 404）
    const game = await prisma.game.findFirst({
      where: { id: gameId, tenantId },
      select: { id: true },
    });
    if (!game) {
      return Response.json({ error: '游戏不存在' }, { status: 404 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const check = validateUploadFile(file.name, bytes);
    // ok === false 显式判别（tsconfig strictNullChecks:false 下 !x.ok 不触发联合收窄）
    if (check.ok === false) {
      return Response.json({ error: check.error }, { status: check.status });
    }

    // 先落盘后落库；落库失败回滚删文件（不留孤儿文件）
    const saved = await saveMaterialFile(game.id, file.name, bytes);
    try {
      const material = await prisma.material.create({
        data: {
          id: saved.id, // 行 id = 文件名 cuid 前缀，行与文件同源可溯
          tenantId,
          gameId: game.id,
          type: typeParsed.data,
          source: '你上传',
          fileName: file.name,
          storageRef: saved.storageRef,
          mimeType: check.mimeType,
          sizeBytes: bytes.length,
          // P6：视频族仅存元数据，落库即 failed + parseError 明示（可重试语义）
          parseStatus: check.parseable ? 'pending' : 'failed',
          parseError: check.parseable ? null : METADATA_ONLY_PARSE_ERROR,
        },
      });
      return Response.json(
        { material: toMaterialDto(material) },
        { status: 201 },
      );
    } catch (dbError) {
      await removeMaterialFile(saved.storageRef);
      throw dbError;
    }
  } catch (error) {
    console.error('[api/materials] POST 失败:', error);
    return Response.json({ error: '上传失败，请重试' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const tenantId = await getDevTenantId();
    const gameId = new URL(req.url).searchParams.get('gameId');
    if (!gameId) {
      return Response.json({ error: '缺少 gameId 查询参数' }, { status: 400 });
    }
    const materials = await prisma.material.findMany({
      where: { tenantId, gameId },
      orderBy: { createdAt: 'asc' },
    });
    return Response.json({ materials: materials.map(toMaterialDto) });
  } catch (error) {
    console.error('[api/materials] GET 失败:', error);
    return Response.json({ error: '查询失败，请重试' }, { status: 500 });
  }
}
