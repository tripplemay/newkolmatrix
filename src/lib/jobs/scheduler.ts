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
import { DEV_TENANT_SLUG, systemTenantId } from 'lib/agent/context';
import { health as apifyKolHealth } from 'lib/apify/client';
import { withTenant } from 'lib/db/tenant-scope';
import { syncKols } from 'lib/kol-sync/sync';
import { runHealthScan } from './routines/health-scan';
import { runNightlyScreen } from './routines/nightly-screen';
import { runWeeklyDraft } from './routines/weekly-draft';

/** 夜间巡检 cron 表达式（服务器本地时区）。常量导出供测试/文档引用，不散落魔数。 */
export const HEALTH_SCAN_CRON = '0 2 * * *';

/** 夜间筛查 cron（M2-A F006；与 health-scan 02:00 错峰）。 */
export const NIGHTLY_SCREEN_CRON = '30 2 * * *';

/** 外采同步 cron（M2-B F003；与前两例程错峰）。 */
export const KOL_SYNC_CRON = '0 3 * * *';

/** 周报起草 cron（M4 F011；每周一 04:00，与夜间例程错峰）。 */
export const WEEKLY_DRAFT_CRON = '0 4 * * 1';

/** 例程注册表条目（F006；M5-AUTH-RLS F010 加 tenantSlug）。 */
export interface RoutineDef {
  name: string;
  cron: string;
  /**
   * M5-AUTH-RLS F010（spec D-3 无会话面）——**这条例程作用在哪个租户上，写在注册处**。
   *
   * 例程跑在没有登录会话的进程里，租户不可能从会话来；本批之前它来自一个叫
   * `getDevTenantId` 的函数，读注册表看不出租户是谁。现在改成注册时指名：
   * 想知道 nightly-screen 作用于谁，看这一行就够，不用追进执行体。
   *
   * 当前四条都是 `dev`——这是**把现语义显式写出来**，不是新增默认值。改成多租户轮询
   * 是一个独立决策（要考虑并发、互斥锁粒度、失败隔离），改这里一行不能替代那个决策。
   */
  tenantSlug: string;
  /**
   * 执行体（互斥与异常消化由调度层统一包裹，run 内不重复实现）。
   *
   * 租户 slug 由调度层从注册表传入，**由执行体自己按需解析成 id**——刻意不在调度层预先解析：
   * kol-sync 在探活失败时要早退且不碰库，预解析会给它加一次无谓查询，还会让
   *「dev 租户不存在的环境」从静默跳过变成抛错（行为回归）。
   */
  run: (tenantSlug: string) => Promise<unknown>;
}

/**
 * health-scan 那次事务的超时（M5.1b F005）。
 *
 * 包进 withTenant 后，一轮巡检的「N 次 Project 读 + N 条 OperationLog 写」变成**一个**事务
 * （原先是逐条自动提交）。Prisma interactive transaction 默认 5s —— 项目数一多就会在
 * 「跑到一半被打断」处炸，而这条例程在夜里无人值守。给一个与量级匹配的显式上限，
 * 并把「为什么不是默认值」写在这里，而不是等生产超时才现形。
 * 选项只能在**最外层**那次 withTenant 传（嵌套传即抛 NestedTransactionOptionsError），
 * 例程是无会话面、无外层作用域，正是该传的地方。
 */
export const HEALTH_SCAN_TX_TIMEOUT_MS = 60_000;

/**
 * 例程注册表（F006）：新例程在此登记即自动获得调度（:1815 口径兑现）。
 * 数组顺序即注册顺序，无优先级语义。
 *
 * 【M5.1b F005 · 租户作用域接线边界（spec D-6：本批只做最小闭环）】
 * 只有 health-scan 被包进 `withTenant` —— 它是 spec D-6 最小闭环里「一个例程」的那一条。
 * 其余三条（nightly-screen / kol-sync / weekly-draft）**刻意未包**：它们各自有网关外呼、
 * 内网探活、降级路径，包进一个事务需要逐条决定超时与外呼边界（gate.ts 那 90s 事务同款问题），
 * 属 M5.2 全站收口的工作面。开关未开时它们行为逐位不变；开关一开会当场抛
 * MissingTenantScopeError（fail-closed，不是静默零行）。未覆盖清单由 F007 落盘。
 */
export const ROUTINES: ReadonlyArray<RoutineDef> = [
  {
    name: 'health-scan',
    cron: HEALTH_SCAN_CRON,
    tenantSlug: DEV_TENANT_SLUG,
    run: async (tenantSlug) => {
      // slug→id 解析走 privilegedDb（F003 引导白名单），刻意在作用域**外**：
      // 租户 id 是开作用域的入参，不可能在作用域内才拿到。
      const tenantId = await systemTenantId(tenantSlug);
      const r = await withTenant(
        tenantId,
        () => runHealthScan(tenantId, new Date()),
        { timeout: HEALTH_SCAN_TX_TIMEOUT_MS },
      );
      console.log(
        `[jobs] health-scan 完成：扫描 ${r.scanned} 项目，留痕 ${r.logged} 条`,
      );
      return r;
    },
  },
  {
    name: 'nightly-screen',
    cron: NIGHTLY_SCREEN_CRON,
    tenantSlug: DEV_TENANT_SLUG,
    run: async (tenantSlug) => {
      const tenantId = await systemTenantId(tenantSlug);
      const r = await runNightlyScreen(tenantId);
      console.log(
        `[jobs] nightly-screen 完成：${r.projects} 项目（成功 ${r.succeeded} / 失败 ${r.failed}）`,
      );
      return r;
    },
  },
  {
    name: 'kol-sync',
    cron: KOL_SYNC_CRON,
    tenantSlug: DEV_TENANT_SLUG,
    run: async (tenantSlug) => {
      // M2-B F003：dev 内网不可达属预期（apify-kol 在 deploysvr kol-shared 网络）——
      // 探活失败静默跳过 log warn 不炸（spec §2 F003 硬要求）；env 未配同走此分支。
      if (!(await apifyKolHealth())) {
        console.warn(
          '[jobs] kol-sync：apify-kol 探活失败，本轮跳过（dev 内网不可达属预期）',
        );
        return { skipped: true };
      }
      const tenantId = await systemTenantId(tenantSlug);
      const r = await syncKols(tenantId);
      console.log(
        `[jobs] kol-sync 完成：拉取 ${r.fetched}（新建 ${r.created}/更新 ${
          r.updated
        }），embedding 补灌 ${r.embedded}${r.truncated ? '，已截断' : ''}`,
      );
      return r;
    },
  },
  {
    name: 'weekly-draft',
    cron: WEEKLY_DRAFT_CRON,
    tenantSlug: DEV_TENANT_SLUG,
    run: async (tenantSlug) => {
      // M4 F011：跨项目周报起草（internal only——只落草案；对外分享须人过 create_share_link 闸门）。
      // 无网关凭据由服务层降级固定草案（明示不静默），例程不因此失败。
      const tenantId = await systemTenantId(tenantSlug);
      const r = await runWeeklyDraft(tenantId);
      console.log(
        `[jobs] weekly-draft 完成：周期 ${r.period} 草案 ${r.reportId}${
          r.degraded ? '（降级固定草案）' : ''
        }${r.skippedAdopted ? '（已采纳，冻结跳过）' : ''}`,
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
      // F010：租户 slug 从注册表条目取，调度层不知道也不假设"默认租户"是谁。
      void runExclusive(routine.name, () => routine.run(routine.tenantSlug)).catch((err) => {
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
