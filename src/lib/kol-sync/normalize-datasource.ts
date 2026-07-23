// M2-B-CREATORS F003 —【P4】存量 dataSource 归一：'csv-seed:*' → 'user_upload'。
//
// 背景（勘查实证）：seed 写入的 `dataSource='csv-seed:kol-seed-enriched-final.csv'`
// 不在 provenance 六档枚举内 → resolveProvenance 行级第②级校验失败，
// **恒落第③级 ai_estimate fallback**（as-built bug）。'user_upload'（你上传）是
// 六档内与「CSV 种子数据」语义相符的档位。
//
// 幂等：LIKE 'csv-seed:%' 命中即改，二跑命中 0；'crawl' 等其他值不触碰。
// stats 显式计数（database-patterns §6：updateMany 静默 count=0 必须显式呈现）。

import { prisma } from 'lib/db/prisma';

export interface NormalizeDataSourceResult {
  /** 命中的 csv-seed:* 行数（dry-run 与 apply 同口径） */
  matched: number;
  /** 实际改写行数（dry-run 恒 0） */
  updated: number;
  applied: boolean;
}

export async function normalizeDataSource(
  tenantId: string,
  opts: { apply: boolean },
): Promise<NormalizeDataSourceResult> {
  const matched = await prisma.kol.count({
    where: { tenantId, dataSource: { startsWith: 'csv-seed:' } },
  });
  if (!opts.apply) {
    return { matched, updated: 0, applied: false };
  }
  const r = await prisma.kol.updateMany({
    where: { tenantId, dataSource: { startsWith: 'csv-seed:' } },
    data: { dataSource: 'user_upload' },
  });
  return { matched, updated: r.count, applied: true };
}
