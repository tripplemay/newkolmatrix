// M4-INSIGHT F011 — Evaluator 探针：scheduler 注册链路（cron 真注册，非仅注册表数组断言）。
//
// 运行：node --env-file=.env --import tsx scripts/test/f011-scheduler-check.ts
// 只读：注册后立即 destroy 全部 task，不落库、不外呼。

import cron from 'node-cron';
import { ROUTINES, startScheduler } from '../../src/lib/jobs/scheduler';

delete process.env.ROUTINES_DISABLED;
startScheduler();
const tasks = cron.getTasks();
console.log(`registered cron tasks = ${tasks.size} / ROUTINES = ${ROUTINES.length}`);
startScheduler(); // 幂等：重复调用不重复注册
console.log(`after 2nd startScheduler = ${cron.getTasks().size}`);
console.log(
  `routines = ${ROUTINES.map((r) => `${r.name}@${r.cron}`).join(' / ')}`,
);
const ok =
  tasks.size === ROUTINES.length &&
  cron.getTasks().size === ROUTINES.length &&
  ROUTINES.some((r) => r.name === 'weekly-draft' && r.cron === '0 4 * * 1');
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
for (const t of cron.getTasks().values()) void t.destroy();
process.exit(ok ? 0 : 1);
