// M2-A-MATCH F004 — POST /api/match/refresh?projectId=：手动重跑候选 + 组合生成。
//
// 三入口之三（F005 首访 lazy / F006 nightly-screen 例程之外的手动入口）；
// 本批无 UI 按钮（原型无，不自创），供验收与后续批次用。
// P4 语义由服务层保证：verdict 保留 / approved 永不动。
// 运行时 = nodejs；网关不可达 → 502 明示（手动入口不静默，与 F005 lazy 的
// 静默降级刻意不同——主动触发者需要知道失败）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { generateCandidates } from 'lib/match/generate-candidates';
import { buildMatchPlans } from 'lib/match/build-plans';

export const runtime = 'nodejs';
export const maxDuration = 60; // 同步生成：embedding 单往返 + 批量 upsert 预算内

export async function POST(req: Request): Promise<Response> {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId');
    if (!projectId) {
      return Response.json({ error: '缺少 projectId 参数' }, { status: 400 });
    }

    const tenantId = await getDevTenantId();
    const project = await prisma.project.findFirst({
      where: { tenantId, OR: [{ slug: projectId }, { id: projectId }, { publicId: projectId }] },
      select: { id: true },
    });
    if (!project) {
      return Response.json({ error: '项目不存在' }, { status: 404 });
    }

    const candidates = await generateCandidates(project.id);
    const plans = await buildMatchPlans(project.id);

    return Response.json({ candidates, plans });
  } catch (error) {
    console.error('[api/match/refresh] 失败:', error);
    // 网关不可达 / embedding 失败等：手动入口明示失败（区别于 F005 lazy 静默降级）
    return Response.json(
      { error: '候选生成失败（网关不可达或数据异常），请稍后重试' },
      { status: 502 },
    );
  }
}
