// M4-INSIGHT F011 — weekly-draft 手动触发口（不等 cron 到点；实测与验收用）。
//
// 运行：npm run routine:weekly-draft
// 与 scheduler 走同一执行体（runExclusive + runWeeklyDraft），非旁路实现。

import { DEV_TENANT_SLUG, systemTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { runExclusive } from '../../src/lib/jobs/scheduler';
import { runWeeklyDraft } from '../../src/lib/jobs/routines/weekly-draft';

async function main(): Promise<void> {
  const tenantId = await systemTenantId(DEV_TENANT_SLUG);
  const result = await runExclusive('weekly-draft', () =>
    runWeeklyDraft(tenantId),
  );
  if (result == null) {
    console.log('[routine:weekly-draft] 互斥锁占用，本轮跳过');
    return;
  }
  console.log(
    `[routine:weekly-draft] ✅ 周期 ${result.period} 草案 ${result.reportId}${
      result.degraded ? '（无凭据降级固定草案）' : ''
    }${result.skippedAdopted ? '（同周期已采纳，冻结跳过）' : ''}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[routine:weekly-draft] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
