// M1-C F004 — 例程调度器（ADR-20：node-cron 进程内，单实例 + 例程互斥锁，不建队列）。
//
// 载体裁决（D-C）：node-cron 进程内而非系统 crontab 打端点——docker 单容器自足、
// 不动部署面、无内部端点鉴权问题（当前无认证层）。启动挂 instrumentation.ts
//（Next.js 标准钩子，仅 NEXT_RUNTIME==='nodejs'）。
//
// 互斥锁：进程内布尔锁（单实例部署，ADR-20 明示；上一轮未结束跳过本轮不重入）。
// 开关：ROUTINES_DISABLED=true 整体关闭（默认开）。
// 例程边界：只跑 internal 纯计算类，无 outbound 直通（architecture.md:1182）——
// 本批唯一例程 health-scan 不调网关不涉闸门。

import cron from 'node-cron';
import { getDevTenantId } from 'lib/agent/context';
import { runHealthScan } from './routines/health-scan';

/** 夜间巡检 cron 表达式（服务器本地时区）。常量导出供测试/文档引用，不散落魔数。 */
export const HEALTH_SCAN_CRON = '0 2 * * *';

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
  cron.schedule(HEALTH_SCAN_CRON, () => {
    void runExclusive('health-scan', async () => {
      const tenantId = await getDevTenantId();
      const r = await runHealthScan(tenantId, new Date());
      console.log(
        `[jobs] health-scan 完成：扫描 ${r.scanned} 项目，留痕 ${r.logged} 条`,
      );
      return r;
    }).catch((err) => {
      // 例程失败只留日志不炸进程（下一轮 cron 自然重试）
      console.error('[jobs] health-scan 失败：', err);
    });
  });
  console.log(`[jobs] 例程调度已启动（health-scan @ ${HEALTH_SCAN_CRON}）`);
}
