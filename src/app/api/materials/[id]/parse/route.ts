// M1-D-KNOWLEDGE F003 — POST /api/materials/{id}/parse：触发素材解析。
//
// 上传后自动触发一次 + 「重新分析」按钮复用同一端点（ADR-19 同步执行 + 前端轮询，
// 不建队列）。并发重入 → 409（P2 进程内防重入）；解析失败已在状态机内消化为
// failed + parseError → 对调用方仍是 200 + material（前端按 parseStatus 呈现，D2）。
// 运行时 = nodejs（Prisma + 磁盘 + 网关调用）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { parseMaterial } from 'lib/knowledge/parse';
import { toMaterialDto } from 'lib/knowledge/dto';

export const runtime = 'nodejs';
export const maxDuration = 60; // 同步解析：文本/图片单素材网关往返预算内（ADR-19）

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const tenantId = await getDevTenantId();

    // 素材必须存在且属当前租户（不信任路径参数）
    const material = await prisma.material.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!material) {
      return Response.json({ error: '素材不存在' }, { status: 404 });
    }

    const result = await parseMaterial(id);
    if (result.ok === false) {
      if (result.code === 'ALREADY_PARSING') {
        return Response.json(
          {
            error: '该素材正在解析中，请勿重复触发',
            material: result.material ? toMaterialDto(result.material) : null,
          },
          { status: 409 },
        );
      }
      if (result.code === 'NOT_FOUND') {
        return Response.json({ error: '素材不存在' }, { status: 404 });
      }
      // PARSE_FAILED：状态机内已消化为 failed + parseError，对轮询方是正常业务结果
      return Response.json({
        material: result.material ? toMaterialDto(result.material) : null,
      });
    }

    return Response.json({
      material: toMaterialDto(result.material),
      knowledgeCount: result.knowledgeCount,
    });
  } catch (error) {
    console.error('[api/materials/parse] 失败:', error);
    return Response.json({ error: '解析触发失败，请重试' }, { status: 500 });
  }
}
