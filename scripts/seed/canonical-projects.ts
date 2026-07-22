// M1-A-BRIEF F003 — 四个 canonical 项目 + 其游戏落库。
//
// 目的：M1-B 把页面切到真数据时，得有一份与现有 mock 对得上的对照物，
// 否则「页面接真数据」这一步会同时改数据源和改数据内容，出了问题分不清是哪一边。
//
// 取值来源与偏离（spec D14 裁决，逐条可审计）：
//   · id(→slug) / name / game / market / owner / cur —— 与 src/lib/data/mock/projects.ts:36-81 逐字一致
//   · budget 串 → budgetTotal + currency —— '$18,000' 解析为 18000 + 'USD'（无损）
//   · goal —— mock 里是散文（且四条中三条的目标压根不是曝光量：lc 是榜位、aw 是评测数、
//     mf 是安装数），无法逐字搬进 D6 规定的 {targetExposure, periodStart, periodEnd} jsonb。
//     用户裁决 D14 = 补齐。派生规则见下方 DERIVED_* 常量，**这两类值是演示夹具，不是实测**。
//   · health —— 不 seed（D6：它是 health.compute 的产物，落库即造出可漂移的第二真相）
//
// 幂等：按 slug upsert，重跑不产生重复行。
//
// 运行：npm run seed:projects

import { DEV_TENANT_SLUG } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import type { Stage } from '../../src/lib/agent/stage-routing';
import type { ProjectGoal } from '../../src/lib/data/schemas/project';

/**
 * targetExposure 的派生基准（D14）。
 *
 * 四条 mock 里只有 xg 的文案含明确曝光目标——「300 万曝光」对应 `$18,000`，
 * 得 ≈167 曝光/美元。其余三条按各自预算等比换算并取整到万位。
 * 这是为了让派生**可审计**（换个人也能算出同样的数），不是精算模型。
 */
const EXPOSURE_PER_USD = 3_000_000 / 18_000; // ≈166.67

/** 按预算等比派生曝光目标，取整到万位。 */
function derivedExposure(budgetUsd: number): number {
  return Math.round((budgetUsd * EXPOSURE_PER_USD) / 10_000) * 10_000;
}

interface SeedProject {
  /** 与 mock 的 id 一致，落 slug 列 */
  slug: string;
  name: string;
  /** 游戏名（同步建 Game 行并关联） */
  game: string;
  market: string;
  owner: string;
  cur: Stage;
  /** mock 的 budget 串解析结果 */
  budgetUsd: number;
  /** 周期（D14 演示夹具：按各项目 cur 所处阶段配置，使「时间进度」因子有区分度） */
  periodStart: string;
  periodEnd: string;
}

/** 与 mock/projects.ts:36-81 对齐。budgetUsd 由 budget 串解析，周期为 D14 补齐。 */
const SEED_PROJECTS: SeedProject[] = [
  {
    slug: 'xg',
    name: '《星轨协议》· 全球公测预热',
    game: '星轨协议',
    market: '全球',
    owner: 'MC',
    cur: 'reach',
    budgetUsd: 18_000, // mock '$18,000'
    periodStart: '2026-07-01', // 进行中（cur=reach）
    periodEnd: '2026-07-31',
  },
  {
    slug: 'lc',
    name: '《料理次元》· 日本区上线',
    game: '料理次元',
    market: '日本',
    owner: 'AD',
    cur: 'match',
    budgetUsd: 12_000, // mock '$12,000'
    periodStart: '2026-07-15', // 刚开始（cur=match）
    periodEnd: '2026-08-31',
  },
  {
    slug: 'aw',
    name: '《暗域拓荒》· Steam 抢先体验',
    game: '暗域拓荒',
    market: 'Steam 全球',
    owner: 'KM',
    cur: 'delivery',
    budgetUsd: 9_000, // mock '$9,000'
    periodStart: '2026-06-01', // 接近结束（cur=delivery）
    periodEnd: '2026-07-31',
  },
  {
    slug: 'mf',
    name: '《萌宠农场》· 北美拉新',
    game: '萌宠农场',
    market: '北美',
    owner: 'AD',
    cur: 'insight',
    budgetUsd: 7_500, // mock '$7,500'
    periodStart: '2026-05-15', // 已结束（cur=insight）
    periodEnd: '2026-07-15',
  },
];

async function main(): Promise<void> {
  // M1-B F001（D7）：自建 dev tenant 使本 seed 自足——CI visual job 只跑
  // migrate + seed:projects（详情页 RSC 直读只需 Project 行），不跑 seed:kol
  //（embedding 依赖网关凭据，进视觉门会引入外部抖动）。与 import-kol-csv.ts 同 upsert 口径，幂等。
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    create: { slug: DEV_TENANT_SLUG, name: 'Dev Tenant' },
    update: {},
    select: { id: true },
  });
  const tenantId = tenant.id;

  for (const p of SEED_PROJECTS) {
    // Game 先落，否则 Project.gameId 的 FK 悬空。
    const gameSlug = `game-${p.slug}`;
    const game = await prisma.game.upsert({
      where: { slug: gameSlug },
      create: { slug: gameSlug, tenantId, name: p.game },
      update: { name: p.game },
      select: { id: true },
    });

    const goal: ProjectGoal = {
      targetExposure: derivedExposure(p.budgetUsd),
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
    };

    // maxReached 与 cur 同值：seed 是「项目推进到此处」的快照，
    // 历史最远解锁位不可能小于当前位（D2 不变量 curIdx <= maxReachedIdx）。
    const row = await prisma.project.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        tenantId,
        name: p.name,
        owner: p.owner,
        market: p.market,
        gameId: game.id,
        budgetTotal: p.budgetUsd,
        currency: 'USD',
        goal,
        cur: p.cur,
        maxReached: p.cur,
      },
      update: {
        name: p.name,
        owner: p.owner,
        market: p.market,
        gameId: game.id,
        budgetTotal: p.budgetUsd,
        currency: 'USD',
        goal,
        cur: p.cur,
        maxReached: p.cur,
      },
      select: { id: true },
    });
    console.log(
      `[seed:projects] ✓ ${p.slug} ${p.name} — cur=${
        p.cur
      } 预算=$${p.budgetUsd.toLocaleString(
        'en-US',
      )} 目标曝光=${goal.targetExposure.toLocaleString('en-US')} id=${row.id}`,
    );
  }

  const total = await prisma.project.count({ where: { tenantId } });
  console.log(`[seed:projects] ✅ 完成，租户下共 ${total} 个项目`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[seed:projects] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
