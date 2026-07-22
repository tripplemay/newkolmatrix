// M1-C F004 — health-scan 手动触发口（不等 cron 到点；实测与验收用）。
//
// 运行：npm run routine:health-scan
// 与 scheduler 走同一执行体（runExclusive + runHealthScan），非旁路实现。

import { getDevTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { runExclusive } from '../../src/lib/jobs/scheduler';
import { runHealthScan } from '../../src/lib/jobs/routines/health-scan';

async function main(): Promise<void> {
  const tenantId = await getDevTenantId();
  const result = await runExclusive('health-scan', () =>
    runHealthScan(tenantId, new Date()),
  );
  if (result == null) {
    console.log('[routine:health-scan] 互斥锁占用，本轮跳过');
    return;
  }
  console.log(
    `[routine:health-scan] ✅ 扫描 ${result.scanned} 项目，留痕 ${result.logged} 条（kind=auto）`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[routine:health-scan] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
