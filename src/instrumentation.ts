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
    // M5.1b F003 —— 哨兵必须问**运行时 client**，不能问 `prisma` 代理，也不能问 privilegedDb：
    //   · 问代理：开关开时无 ALS 作用域，代理抛 MissingTenantScopeError，而该异常被
    //     app-role.ts 的「连不上库只告警」catch 吞掉 → 返回 status='unknown'。哨兵 enforced=true
    //     却永远走不到判定那一步，**安全装置静默失效**（实测：{"info":null,"status":"unknown"}）。
    //   · 问 privilegedDb：它恒是特权连接，哨兵会恒答「特权」→ enforced 时恒抛，永假警报。
    //   · 问 getRuntimeDb()：正是「应用运行时到底连的是谁」这个问题本身
    //     （实测开关开时得 {"role":"kol_app","superuser":false,"bypassRls":false,"status":"ok"}）。
    // spec D-5 的表把本处列为「引导点，应走 privilegedDb」——**该判定有误**，已在 F003 普查中
    // 逐条登记并修正（见 docs/specs/M5.1b-TENANT-INJECTION-spec.md D-5 更正段）。
    const [{ getRuntimeDb }, { runConnectionRoleSentinel }] = await Promise.all([
      import('./lib/db/runtime'),
      import('./lib/db/app-role'),
    ]);
    await runConnectionRoleSentinel(getRuntimeDb());

    const { startScheduler } = await import('./lib/jobs/scheduler');
    startScheduler();
  }
}
