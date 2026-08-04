// M1-C F004 — Next.js instrumentation 钩子：服务器进程启动时注册例程调度（ADR-20）。
//
// 仅 nodejs runtime（edge/browser 不跑 cron）；动态 import 防止 scheduler 及其
// prisma 依赖被打进 edge/client bundle。ROUTINES_DISABLED=true 时 startScheduler
// 内部自行短路。

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // M5-AUTH-RLS F007（spec D-5）— BYPASSRLS 哨兵：问一次数据库「这条连接是谁」。
    // 配了 DATABASE_URL_APP（= 声明应用要跑非特权角色）却连上 SUPERUSER/BYPASSRLS 角色时，
    // 这里会抛——不让一个「RLS 已静默失效」的进程装作正常对外服务。未配时只大声告警
    //（本机 dev / 既有测试的现状，D-8）。判定分级在 lib/db/app-role.ts，此处只接线。
    const [{ prisma }, { runConnectionRoleSentinel }] = await Promise.all([
      import('./lib/db/prisma'),
      import('./lib/db/app-role'),
    ]);
    await runConnectionRoleSentinel(prisma);

    const { startScheduler } = await import('./lib/jobs/scheduler');
    startScheduler();
  }
}
