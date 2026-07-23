// M2-B-CREATORS F003 — 存量 dataSource 归一 ops 脚本（【P4】，dry-run 默认）。
//
// 运行：
//   npm run ops:normalize-datasource            # dry-run：只报命中数，不改
//   npm run ops:normalize-datasource -- --apply # 实际改写 csv-seed:* → user_upload
//
// stats 显式输出（database-patterns §6/§7：prod-shaped 数据端到端实跑 + 显式计数）。

import { getDevTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { normalizeDataSource } from '../../src/lib/kol-sync/normalize-datasource';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const tenantId = await getDevTenantId();
  const r = await normalizeDataSource(tenantId, { apply });
  console.log(
    `[ops:normalize-datasource] ${apply ? 'APPLY' : 'DRY-RUN'} — 命中 csv-seed:* ${r.matched} 行，改写 ${r.updated} 行`,
  );
  if (!apply && r.matched > 0) {
    console.log('[ops:normalize-datasource] 追加 --apply 执行实际改写');
  }
  if (apply && r.updated !== r.matched) {
    console.warn(
      `[ops:normalize-datasource] ⚠️ updated(${r.updated}) != matched(${r.matched})——并发变更或过滤漂移，请复查`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[ops:normalize-datasource] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
