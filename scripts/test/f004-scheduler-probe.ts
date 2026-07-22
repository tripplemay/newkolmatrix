// M1-C F004 验收探针（Evaluator 产物）— startScheduler 行为实证：
//   1. ROUTINES_DISABLED=true 时不注册任何 cron 任务（开关可关）
//   2. 默认（未设置）时注册 1 条任务（默认开），cron 常量 = '0 2 * * *'
//   3. 重复调用 startScheduler 不重复注册（幂等，防 dev HMR 多次 import）
//
// 用法（进程隔离，两种模式各起一个进程，因 started 为模块级标志）：
//   node --env-file=.env --import tsx scripts/test/f004-scheduler-probe.ts disabled
//   node --env-file=.env --import tsx scripts/test/f004-scheduler-probe.ts default
//
// 断言依据：node-cron getTasks() 返回已注册任务表。静态 import 保证与 scheduler.ts
// 同一 node-cron 模块实例（node-cron 4.x 双构建 ESM/CJS，动态 import 会拿到另一个
// 实例的空注册表——首版探针踩中，见 F004 验收报告）。ROUTINES_DISABLED 在
// startScheduler() 调用时读取而非模块加载时，故 env 可在 import 后设置。
// 本探针只注册不等触发（02:00 到点才跑），不写 DB、进程立即退出，无残留。

import cron from 'node-cron';
import { startScheduler, HEALTH_SCAN_CRON } from '../../src/lib/jobs/scheduler';

function main(): void {
  const mode = process.argv[2] ?? 'default';
  if (mode === 'disabled') process.env.ROUTINES_DISABLED = 'true';
  startScheduler();
  const afterFirst = cron.getTasks().size;
  startScheduler(); // 幂等：重复调用不得重复注册
  const afterSecond = cron.getTasks().size;
  console.log(
    JSON.stringify({ mode, cron: HEALTH_SCAN_CRON, afterFirst, afterSecond }),
  );
  process.exit(0);
}

main();
