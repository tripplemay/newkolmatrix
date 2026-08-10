// M2-A-MATCH F004 — POST /api/match/refresh?projectId=：手动重跑候选 + 组合生成。
//
// 三入口之三（F005 首访 lazy / F006 nightly-screen 例程之外的手动入口）；
// 本批无 UI 按钮（原型无，不自创），供验收与后续批次用。
// P4 语义由服务层保证：verdict 保留 / approved 永不动。
// 运行时 = nodejs；网关不可达 → 502 明示（手动入口不静默，与 F005 lazy 的
// 静默降级刻意不同——主动触发者需要知道失败）。

import { prisma } from 'lib/db/prisma';
// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 表态：外呼**在事务内**，timeout 从网关 abort 上限派生】generateCandidates 要向网关
// 取 embedding 再做 pgvector 检索，读项目 / 写候选与方案都和它在同一段里，路由层拆不开。
// 派生而非写死的理由同 api/reach/refine：AIGC_TIMEOUT_MS 是 env 可覆盖的，写死会让事务
// 先于外呼死掉。余量 20s——本段除外呼外还要写候选与方案两批行，比 refine 那条重。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { AIGC_TIMEOUT_MS } from 'lib/ai/gateway';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { generateCandidates } from 'lib/match/generate-candidates';
import { buildMatchPlans } from 'lib/match/build-plans';

export const runtime = 'nodejs';

/** 事务须长于网关 abort 上限（D-4 表态，见文件头）。 */
const REFRESH_TX_TIMEOUT_MS = AIGC_TIMEOUT_MS + 20_000;
export const maxDuration = 60; // 同步生成：embedding 单往返 + 批量 upsert 预算内

export async function POST(req: Request): Promise<Response> {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId');
    if (!projectId) {
      return Response.json({ error: '缺少 projectId 参数' }, { status: 400 });
    }

    const tenantId = await requireSessionTenantId();
    const outcome = await withSessionTenant(
      async () => {
        const project = await prisma.project.findFirst({
          where: {
            tenantId,
            OR: [{ slug: projectId }, { id: projectId }, { publicId: projectId }],
          },
          select: { id: true },
        });
        if (!project) return null;
        const candidates = await generateCandidates(project.id);
        const plans = await buildMatchPlans(project.id);
        return { candidates, plans };
      },
      { timeout: REFRESH_TX_TIMEOUT_MS },
    );
    if (!outcome) {
      return Response.json({ error: '项目不存在' }, { status: 404 });
    }

    return Response.json(outcome);
  } catch (error) {
    console.error('[api/match/refresh] 失败:', error);
    // 网关不可达 / embedding 失败等：手动入口明示失败（区别于 F005 lazy 静默降级）
    return Response.json(
      { error: '候选生成失败（网关不可达或数据异常），请稍后重试' },
      { status: 502 },
    );
  }
}
