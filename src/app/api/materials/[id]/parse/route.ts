// M1-D-KNOWLEDGE F003 — POST /api/materials/{id}/parse：触发素材解析。
//
// 上传后自动触发一次 + 「重新分析」按钮复用同一端点（ADR-19 同步执行 + 前端轮询，
// 不建队列）。并发重入 → 409（P2 进程内防重入）；解析失败已在状态机内消化为
// failed + parseError → 对调用方仍是 200 + material（前端按 parseStatus 呈现，D2）。
// 运行时 = nodejs（Prisma + 磁盘 + 网关调用）。

import { prisma } from 'lib/db/prisma';
// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 表态：外呼**在事务内**，timeout 从网关 abort 上限派生】parseMaterial 会调网关
// （素材解析 / 向量化），与它前后的素材读写在同一段。派生理由同 api/reach/refine。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { AIGC_TIMEOUT_MS } from 'lib/ai/gateway';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { parseMaterial } from 'lib/knowledge/parse';
import { toMaterialDto } from 'lib/knowledge/dto';

export const runtime = 'nodejs';

/** 事务须长于网关 abort 上限（D-4 表态，见文件头）。 */
const PARSE_TX_TIMEOUT_MS = AIGC_TIMEOUT_MS + 20_000;
export const maxDuration = 60; // 同步解析：文本/图片单素材网关往返预算内（ADR-19）

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const tenantId = await requireSessionTenantId();

    // 素材必须存在且属当前租户（不信任路径参数）
    const outcome = await withSessionTenant(
      async () => {
        const material = await prisma.material.findFirst({
          where: { id, tenantId },
          select: { id: true },
        });
        if (!material) return null;
        return parseMaterial(id);
      },
      { timeout: PARSE_TX_TIMEOUT_MS },
    );
    if (!outcome) {
      return Response.json({ error: '素材不存在' }, { status: 404 });
    }
    const result = outcome;
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
