// M1-C F004 — Next.js instrumentation 钩子：服务器进程启动时注册例程调度（ADR-20）。
//
// 仅 nodejs runtime（edge/browser 不跑 cron）；动态 import 防止 scheduler 及其
// prisma 依赖被打进 edge/client bundle。ROUTINES_DISABLED=true 时 startScheduler
// 内部自行短路。

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/jobs/scheduler');
    startScheduler();
  }
}
