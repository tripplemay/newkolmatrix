// M1-C F004 — 例程调度器（ADR-20：node-cron 进程内，单实例 + 例程互斥锁，不建队列）。
// M2-A F006 — 注册表化（消解 architecture :1815 口径差）：例程以 ROUTINES 数组登记、
// 循环注册——新例程「自动获得调度」只需向注册表加一项，不再改启动逻辑。
// runExclusive / ROUTINES_DISABLED / 失败不炸进程语义逐条保持（health-scan 行为零变更）。
//
// 载体裁决（D-C）：node-cron 进程内而非系统 crontab 打端点——docker 单容器自足、
// 不动部署面、无内部端点鉴权问题（当前无认证层）。启动挂 instrumentation.ts
//（Next.js 标准钩子，仅 NEXT_RUNTIME==='nodejs'）。
//
// 互斥锁：进程内布尔锁（单实例部署，ADR-20 明示；上一轮未结束跳过本轮不重入）。
// 开关：ROUTINES_DISABLED=true 整体关闭（默认开）。
// 例程边界：只跑 internal 类，无 outbound 直通（architecture.md:1182）——
// health-scan 纯计算不调网关；nightly-screen 调网关仅 embedding（internal 检索计算，
// 不发任何对外动作）。

import cron from 'node-cron';
import { getDevTenantId } from 'lib/agent/context';
import { runHealthScan } from './routines/health-scan';
import { runNightlyScreen } from './routines/nightly-screen';

/** 夜间巡检 cron 表达式（服务器本地时区）。常量导出供测试/文档引用，不散落魔数。 */
export const HEALTH_SCAN_CRON = '0 2 * * *';

/** 夜间筛查 cron（M2-A F006；与 health-scan 02:00 错峰）。 */
export const NIGHTLY_SCREEN_CRON = '30 2 * * *';

/** 例程注册表条目（F006）。 */
export interface RoutineDef {
  name: string;
  cron: string;
  /** 执行体（互斥与异常消化由调度层统一包裹，run 内不重复实现） */
  run: () => Promise<unknown>;
}

/**
 * 例程注册表（F006）：新例程在此登记即自动获得调度（:1815 口径兑现）。
 * 数组顺序即注册顺序，无优先级语义。
 */
export const ROUTINES: ReadonlyArray<RoutineDef> = [
  {
    name: 'health-scan',
    cron: HEALTH_SCAN_CRON,
    run: async () => {
      const tenantId = await getDevTenantId();
      const r = await runHealthScan(tenantId, new Date());
      console.log(
        `[jobs] health-scan 完成：扫描 ${r.scanned} 项目，留痕 ${r.logged} 条`,
      );
      return r;
    },
  },
  {
    name: 'nightly-screen',
    cron: NIGHTLY_SCREEN_CRON,
    run: async () => {
      const tenantId = await getDevTenantId();
      const r = await runNightlyScreen(tenantId);
      console.log(
        `[jobs] nightly-screen 完成：${r.projects} 项目（成功 ${r.succeeded} / 失败 ${r.failed}）`,
      );
      return r;
    },
  },
];

/** 进程内互斥：例程名 → 是否在跑（单实例部署下即全局互斥，ADR-20）。 */
const running = new Set<string>();

/**
 * 带互斥的例程执行体。上一轮未结束时跳过本轮（返回 null），不排队不重入。
 * 独立导出供单测穷举互斥行为（不必等 cron 到点）。
 */
export async function runExclusive<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (running.has(name)) {
    console.warn(`[jobs] 例程 ${name} 上一轮未结束，本轮跳过（互斥锁）`);
    return null;
  }
  running.add(name);
  try {
    return await fn();
  } finally {
    running.delete(name);
  }
}

let started = false;

/**
 * 注册全部例程并启动调度（幂等：重复调用不重复注册——防 dev HMR / 多次 import）。
 * 由 instrumentation.ts 在 nodejs runtime 调用。
 */
export function startScheduler(): void {
  if (started) return;
  if (process.env.ROUTINES_DISABLED === 'true') {
    console.log('[jobs] ROUTINES_DISABLED=true，例程调度未启动');
    return;
  }
  started = true;
  for (const routine of ROUTINES) {
    cron.schedule(routine.cron, () => {
      void runExclusive(routine.name, routine.run).catch((err) => {
        // 例程失败只留日志不炸进程（下一轮 cron 自然重试）
        console.error(`[jobs] ${routine.name} 失败：`, err);
      });
    });
  }
  console.log(
    `[jobs] 例程调度已启动（${ROUTINES.map((r) => `${r.name} @ ${r.cron}`).join(
      ' / ',
    )}）`,
  );
}
