// M2-B-CREATORS F004 — 创作者库 RSC 组装层（knowledge/page-data 先例）。
//
// 服务端筛选（筛选态 URL 化裁决 #4：RSC 读 searchParams → 此处过滤）；
// 列表上限 LIST_LIMIT（库存 2500+ 行全渲染不可行；KPI 计数用全量真值，
// 截断在 meta.listTruncated 显式暴露——no silent caps）。

import { prisma } from 'lib/db/prisma';
import {
  kolToCreatorView,
  resolveCredGrade,
  CRED_GRADE_THRESHOLDS,
  type CreatorView,
} from 'lib/display/creator-format';
import { parseCredibility } from 'lib/data/schemas/kol-deep';

/** 列表渲染上限（followers 降序取前 N；全量计数走 KPI）。 */
export const LIST_LIMIT = 100;

/** 平台 chip 显示序（值域按库内实际出现过滤；'全部' 恒首位）。 */
const PLATFORM_ORDER = ['youtube', 'tiktok', 'instagram', 'twitch', 'x'];
const PLATFORM_CHIP_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitch: 'Twitch',
  x: 'X',
};

export interface CreatorKpiView {
  id: string;
  name: string;
  value: string;
  delta: string | null;
}

export interface CreatorsPageData {
  rows: CreatorView[];
  kpis: CreatorKpiView[];
  /** '全部' + 库内实际出现的平台标签 */
  platformFilters: string[];
  /** '全部品类' + 出现频次 top 品类 */
  categoryFilters: string[];
  /** 当前生效筛选（URL 态回显） */
  platform: string;
  category: string;
  /** 列表被 LIST_LIMIT 截断（页面 meta 行显式提示） */
  listTruncated: boolean;
  totalCount: number;
}

/** 品类归一（mock matchesCreatorFilters 同款：去空格/斜杠，使复合词命中） */
function normalizeGenre(value: string): string {
  return value.replace(/[\s/]/g, '');
}

export async function loadCreatorsPageData(
  tenantId: string,
  params: { platform?: string; category?: string },
): Promise<CreatorsPageData> {
  // 值域与 KPI 用全量（轻查询：只取聚合所需列）
  const all = await prisma.kol.findMany({
    where: { tenantId },
    select: { platform: true, categories: true, credibility: true },
  });
  const totalCount = all.length;

  const platformsPresent = new Set(
    all.map((k) => k.platform).filter((p): p is string => p != null),
  );
  const platformFilters = [
    '全部',
    ...PLATFORM_ORDER.filter((p) => platformsPresent.has(p)).map(
      (p) => PLATFORM_CHIP_LABEL[p] ?? p,
    ),
  ];

  // 品类值域：出现频次 top 4（'全部品类' 恒首位）
  const freq = new Map<string, number>();
  for (const k of all) {
    for (const c of k.categories) freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  const categoryFilters = [
    '全部品类',
    ...[...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c),
  ];

  // URL 态边界校验（未知值回落默认，不信任外部输入——原页面 pickFilter 语义）
  const platform = platformFilters.includes(params.platform ?? '')
    ? (params.platform as string)
    : platformFilters[0];
  const category = categoryFilters.includes(params.category ?? '')
    ? (params.category as string)
    : categoryFilters[0];

  // KPI 真计数（无源项诚实「待接入/待核」，D2 不编数）
  const gradeA = all.filter((k) => {
    const cred = parseCredibility(k.credibility);
    return cred != null && resolveCredGrade(cred.score) === 'A';
  }).length;
  const kpis: CreatorKpiView[] = [
    { id: 'total', name: '库内创作者', value: String(totalCount), delta: null },
    { id: 'reuse', name: '本季度复用', value: '待接入', delta: null }, // 无 CRM 源（M3）
    { id: 'match', name: '平均受众匹配', value: '待核', delta: null }, // P5 无项目上下文
    {
      id: 'premium',
      name: '高价值可复用',
      value: String(gradeA), // credibility ≥ A 阈值（crawl 派生真计数）
      delta: null,
    },
  ];

  // 列表：服务端筛选 + followers 降序 + LIST_LIMIT 截断（显式暴露）
  const platformKey =
    platform === '全部'
      ? null
      : Object.entries(PLATFORM_CHIP_LABEL).find(
          ([, label]) => label === platform,
        )?.[0] ?? platform.toLowerCase();
  const listRows = await prisma.kol.findMany({
    where: {
      tenantId,
      ...(platformKey ? { platform: platformKey } : {}),
      ...(category !== '全部品类'
        ? { categories: { hasSome: [category] } }
        : {}),
    },
    orderBy: [{ followers: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
    take: LIST_LIMIT + 1, // 多取一行判截断
    select: {
      id: true,
      publicId: true,
      displayName: true,
      handle: true,
      platform: true,
      followers: true,
      categories: true,
      contactEmail: true, // M3-A F007：抽屉录入口读侧
      audienceDemo: true,
      credibility: true,
      brandSafety: true,
      dataSource: true,
      fieldProvenance: true,
    },
  });
  const listTruncated = listRows.length > LIST_LIMIT;
  const rows = listRows.slice(0, LIST_LIMIT).map(kolToCreatorView);

  // 品类 chip 的复合词命中（mock 同款归一）在 DB hasSome 精确匹配之外兜底：
  // categories 存的是原始标签，chip 值域即取自同一集合，精确匹配已足够；
  // normalizeGenre 保留导出供单测锚定语义（与 mock 行为对齐的证据面）。
  void normalizeGenre;

  return {
    rows,
    kpis,
    platformFilters,
    categoryFilters,
    platform,
    category,
    listTruncated,
    totalCount,
  };
}
