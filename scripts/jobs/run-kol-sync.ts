// M2-B-CREATORS F003 — kol-sync 手动触发口（不等 cron 到点；L2 实测与验收用）。
//
// 运行：npm run routine:kol-sync
//（本地需 ssh 隧道：ssh -L 3004:localhost:3004 deploysvr + .env 配 APIFY_KOL_*）
// 与 scheduler 走同一执行体（runExclusive + 探活 + syncKols），非旁路实现。

import { getDevTenantId } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { health } from '../../src/lib/apify/client';
import { runExclusive } from '../../src/lib/jobs/scheduler';
import { syncKols } from '../../src/lib/kol-sync/sync';

async function main(): Promise<void> {
  if (!(await health())) {
    console.error(
      '[routine:kol-sync] ❌ apify-kol 探活失败（本地需 ssh 隧道 + APIFY_KOL_* env，见 .env.example）',
    );
    process.exit(1); // 手动入口明示失败（区别于例程静默跳过）
  }
  const tenantId = await getDevTenantId();
  const result = await runExclusive('kol-sync', () => syncKols(tenantId));
  if (result == null) {
    console.log('[routine:kol-sync] 互斥锁占用，本轮跳过');
    return;
  }
  console.log(
    `[routine:kol-sync] ✅ 拉取 ${result.fetched} 行（${result.pages} 页${result.truncated ? '，已截断' : ''}）；` +
      `新建 ${result.created} / 更新 ${result.updated}；派生 audience ${result.derivedAudience} / credibility ${result.derivedCredibility}；embedding 补灌 ${result.embedded}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[routine:kol-sync] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
