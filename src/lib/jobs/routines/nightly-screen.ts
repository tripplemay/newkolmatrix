// M2-A-MATCH F006 — nightly-screen 例程（architecture :1173 + §11.6 :1562-1566）。
//
// 对 cur='match' 的在跑项目逐个刷新候选 + 组合（generateCandidates + buildMatchPlans，
// F003 单一真相源——例程不内联重算）：候选幂等 upsert 保留人工 verdict、组合只
// supersede draft、**approved 永不动**（P4，服务层保证）。
//
// internal only 无 outbound（:1182）：调网关仅 embedding（检索计算），不发任何对外动作。
// 网关失败**逐项目消化不中断整轮**（一个项目挂了其余照跑，failed 计数呈现）。
// 留痕照 health-scan 先例：OperationLog(kind=auto, actor='match',
// payloadJson:{routine:'nightly-screen',…})——巡检历史即按 actor/kind 过滤（:1598）。

import { prisma } from 'lib/db/prisma';
import {
  generateCandidates,
  type GenerateCandidatesDeps,
} from 'lib/match/generate-candidates';
import { buildMatchPlans } from 'lib/match/build-plans';

export interface NightlyScreenResult {
  /** cur='match' 的在跑项目数 */
  projects: number;
  succeeded: number;
  failed: number;
}

/**
 * 对单个 tenant 执行一轮夜间筛查。
 * deps 透传 F003 的 embed 注入点（P7：测试 mock 向量不打网关）。
 */
export async function runNightlyScreen(
  tenantId: string,
  deps: GenerateCandidatesDeps = {},
): Promise<NightlyScreenResult> {
  const rows = await prisma.project.findMany({
    where: { tenantId, cur: 'match' },
    select: { id: true, name: true },
  });

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const candidates = await generateCandidates(row.id, deps);
      const plans = await buildMatchPlans(row.id);
      await prisma.operationLog.create({
        data: {
          tenantId,
          kind: 'auto',
          actor: 'match',
          projectId: row.id,
          summary: `例程筛查：《${row.name}》候选 ${candidates.total} 位，组合 ${plans.plans} 组`,
          payloadJson: {
            routine: 'nightly-screen',
            candidates: candidates.total,
            candidatesCreated: candidates.created,
            plans: plans.plans,
            superseded: plans.superseded,
          },
        },
      });
      succeeded += 1;
    } catch (err) {
      // 逐项目消化：网关不可达 / 数据异常只记日志，不中断整轮、不外抛
      console.error(
        `[jobs] nightly-screen 项目《${row.name}》失败（继续下一项目）：`,
        err instanceof Error ? err.message : err,
      );
      failed += 1;
    }
  }

  return { projects: rows.length, succeeded, failed };
}
