// M2-A-MATCH F006 — nightly-screen 手动触发口（不等 cron 到点；实测与验收用）。
//
// 运行：npm run routine:nightly-screen
// 与 scheduler 走同一执行体（runExclusive + runNightlyScreen），非旁路实现。

import { getDevTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { runExclusive } from '../../src/lib/jobs/scheduler';
import { runNightlyScreen } from '../../src/lib/jobs/routines/nightly-screen';

async function main(): Promise<void> {
  const tenantId = await getDevTenantId();
  const result = await runExclusive('nightly-screen', () =>
    runNightlyScreen(tenantId),
  );
  if (result == null) {
    console.log('[routine:nightly-screen] 互斥锁占用，本轮跳过');
    return;
  }
  console.log(
    `[routine:nightly-screen] ✅ ${result.projects} 项目（成功 ${result.succeeded} / 失败 ${result.failed}）`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[routine:nightly-screen] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
