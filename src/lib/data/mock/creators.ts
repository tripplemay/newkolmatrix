// ARCH-M05 F013 — 创作者库 + 详情抽屉 mock（ui-inventory V9 表 9 行 + V10 深数据）。
//
// 数据形状与数值逐式移植原型 interaction-prototype-v2.html 的 LIBRARY（L604-614）
// 与 detailFor/audFor/sampleTitle/sampleHook（L893-925）——纯确定性推导，无随机、无时钟。
// 深字段按 D2 渲染契约**部分置 null**（缺失就是缺失，绝不填 0 / '' 冒充实测，FR-11.17/11.18）：
//   - 萌农夫（Bilibili）：perf/deliver null → 内容表现「待接入」（平台 API 未接通）
//   - NovaMei：price/exclusive/schedule null → 商务与档期「待补充」（CRM 未录入）
//   - ArkPlays：samples null → 内容样本「待接入」
//   - ChefRen：match/aud/real/active/deliver null → 受众匹配列「待核」（裁决 #2）+ 受众画像「待核」
// 实体携带 { dataSource, fieldProvenance } 契约位（§7.5 ProvenanceCarrier 形状），
// 抽屉 5 处 ProvenanceTag 经 resolveProvenance 三级回退取值（FR-11.19 永不裸数据点）。

export type CredGrade = 'A' | 'B' | 'C';
export type AdDisclosure = 'ok' | 'warn';

export interface CreatorShare {
  label: string;
  pct: number;
}

export interface CreatorAudience {
  /** 地域 donut + legend ×3 */
  region: CreatorShare[];
  /** 年龄段 Progress ×3 */
  age: CreatorShare[];
  /** 游戏品类偏好 Progress ×3 */
  games: CreatorShare[];
  /** 性别（男 / 女） */
  gender: [number, number];
}

export interface CreatorPerf {
  plays: string;
  er: string;
  cr: string;
  /** 近 8 周播放趋势 */
  trend: number[];
}

export interface CreatorDeliver {
  reach: string;
  conv: string;
  cpm: string;
}

export interface CreatorCollab {
  proj: string;
  form: string;
  price: string;
  quality: string;
}

export interface CreatorPrice {
  video: string;
  short: string;
  live: string;
}

export interface CreatorRisk {
  ad: string;
  adWarn: boolean;
  late: number;
  safety: CredGrade;
}

export interface CreatorSample {
  title: string;
  views: string;
  er: string;
}

export interface CreatorJudge {
  match: string;
  reach: string;
  comp: string;
}

export interface CreatorDeep {
  /** 受众画像；null → 待核（采集未完成） */
  aud: CreatorAudience | null;
  /** 粉丝真实性 ring；null → 待核 */
  real: number | null;
  /** 活跃度 ring；null → 待核 */
  active: number | null;
  /** 内容表现；null → 待接入（平台 API 未接通） */
  perf: CreatorPerf | null;
  /** 交付结果三格；null → 待接入 */
  deliver: CreatorDeliver | null;
  /** 合作历史；空数组 → 🔒 空态「与我方暂无合作记录。」 */
  collab: CreatorCollab[];
  rival: string[];
  resp: string;
  last: string;
  /** 商务报价；null → 待补充（CRM 未录入） */
  price: CreatorPrice | null;
  exclusive: string | null;
  schedule: string | null;
  risk: CreatorRisk;
  /** 内容样本 ×3；null → 待接入 */
  samples: CreatorSample[] | null;
  judge: CreatorJudge;
}

/** 表行实体（V9 8 列）+ 溯源契约位（§7.5） */
export interface MockCreator {
  id: string;
  name: string;
  plat: string;
  fans: string;
  genre: string;
  /** 受众匹配 %；null → 「待核」（裁决 #2：字段缺失/契约层 null 唯一触发） */
  match: number | null;
  reuse: number;
  cred: CredGrade;
  ad: AdDisclosure;
  dataSource: unknown;
  fieldProvenance: unknown;
  deep: CreatorDeep;
}

/* ------------------------------------------------------------------ *
 * 原型推导式（逐式移植 detailFor / audFor，确定性）
 * ------------------------------------------------------------------ */

const CRED_SCORE: Record<CredGrade, number> = { A: 92, B: 84, C: 71 };

const REGIONS: CreatorShare[][] = [
  [
    { label: '北美', pct: 42 },
    { label: '东南亚', pct: 28 },
    { label: '其他', pct: 30 },
  ],
  [
    { label: '日本', pct: 48 },
    { label: '东亚', pct: 30 },
    { label: '其他', pct: 22 },
  ],
  [
    { label: '北美', pct: 38 },
    { label: '欧洲', pct: 34 },
    { label: '其他', pct: 28 },
  ],
  [
    { label: '东南亚', pct: 44 },
    { label: '东亚', pct: 32 },
    { label: '其他', pct: 24 },
  ],
];

function shares(pairs: Array<[string, number]>): CreatorShare[] {
  return pairs.map(([label, pct]) => ({ label, pct }));
}

function audFor(genre: string, i: number): CreatorAudience {
  let base: Omit<CreatorAudience, 'region'>;
  if (/射击|竞技|动作/.test(genre)) {
    base = {
      gender: [82, 18],
      age: shares([['18-24', 46], ['25-34', 36], ['35+', 18]]),
      games: shares([['硬核射击', 54], ['竞技 FPS', 28], ['泛动作', 18]]),
    };
  } else if (/休闲|亲子/.test(genre)) {
    base = {
      gender: [40, 60],
      age: shares([['18-24', 22], ['25-34', 42], ['35+', 36]]),
      games: shares([['休闲农场', 46], ['益智', 30], ['亲子', 24]]),
    };
  } else if (/生存|建造|教程/.test(genre)) {
    base = {
      gender: [74, 26],
      age: shares([['18-24', 34], ['25-34', 44], ['35+', 22]]),
      games: shares([['生存建造', 50], ['开放世界', 30], ['沙盒', 20]]),
    };
  } else if (/模拟|经营|生活|美食|视觉|角色/.test(genre)) {
    base = {
      gender: [36, 64],
      age: shares([['18-24', 30], ['25-34', 46], ['35+', 24]]),
      games: shares([['模拟经营', 44], ['生活养成', 32], ['二次元', 24]]),
    };
  } else {
    base = {
      gender: [55, 45],
      age: shares([['18-24', 36], ['25-34', 40], ['35+', 24]]),
      games: shares([['综合', 40], ['策略', 32], ['休闲', 28]]),
    };
  }
  return { ...base, region: REGIONS[i % REGIONS.length] };
}

function sampleTitle(genre: string, k: number): string {
  const set = /射击|竞技/.test(genre)
    ? ['公测首曝10分钟实机', '双武器连招教学', '天梯上分实录']
    : /模拟|经营|生活|美食|视觉|角色/.test(genre)
      ? ['角色养成全流程', '料理收集图鉴', '轻松单手试玩']
      : /休闲|亲子/.test(genre)
        ? ['萌系农场开荒', '好友互助玩法', '亲子同乐时刻']
        : /生存|建造|教程/.test(genre)
          ? ['开局生存指南', '深度建造展示', '抢先体验实录']
          : ['上手体验', '玩法解析', '实况录像'];
  return set[k % set.length];
}

function sampleHook(genre: string): string {
  return /射击|竞技/.test(genre)
    ? '实机手感 + 独家档期'
    : /模拟|生活|美食|视觉|角色/.test(genre)
      ? '养成体验 + 美术调性'
      : /休闲|亲子/.test(genre)
        ? '碎片可玩 + 家庭向'
        : '更新节奏 + 深度玩法';
}

interface CreatorRow {
  id: string;
  name: string;
  plat: string;
  fans: string;
  genre: string;
  match: number | null;
  reuse: number;
  cred: CredGrade;
  ad: AdDisclosure;
}

function buildDeep(row: CreatorRow, i: number): CreatorDeep {
  const { genre, cred, ad, match, reuse } = row;
  const cn = CRED_SCORE[cred];
  const fn = parseFloat(row.fans);
  const form = /射击|竞技/.test(genre)
    ? '实机长视频'
    : /模拟|生活|美食|视觉|角色/.test(genre)
      ? '角色图文'
      : '实况直播';
  const resp = ['当天内', '1 天内', '2 天内'][i % 3];
  const priceVideo = (1.6 + fn * 0.03).toFixed(1);
  return {
    aud: audFor(genre, i),
    real: cn + ((i % 3) - 1),
    active: Math.max(42, cn - 8 + ((i % 5) - 2)),
    perf: {
      plays: `${(fn * 0.28).toFixed(1)}万`,
      er: `${(3.2 + (i % 5) * 0.4).toFixed(1)}%`,
      cr: `${58 + (i % 6) * 3}%`,
      trend: [58, 60, 59, 63, 64, 66, 69, 71].map((x) => x + (i % 4)),
    },
    deliver:
      match === null
        ? null
        : {
            reach: `${(fn * 3.1).toFixed(0)}万`,
            conv: `${(match / 10).toFixed(1)}k`,
            cpm: `$${(6.2 - (match - 70) * 0.06).toFixed(1)}`,
          },
    collab:
      reuse > 0
        ? Array.from({ length: Math.min(reuse, 2) }, (_, k) => ({
            proj: ['星轨协议', '料理次元', '暗域拓荒'][(i + k) % 3],
            form,
            price: `$${(1.8 + k * 0.6).toFixed(1)}k`,
            quality: k === 0 ? '优' : '良',
          }))
        : [],
    rival: /射击|竞技/.test(genre)
      ? ['同类射击 A', '竞技手游 B']
      : /模拟|生活|美食|视觉|角色/.test(genre)
        ? ['生活手游 C']
        : ['同品类 D'],
    resp,
    last: ad === 'warn' ? '有 1 次延迟交付记录' : '上次合作交付准时',
    price: {
      video: `$${priceVideo}k`,
      short: `$${(0.9 + fn * 0.015).toFixed(1)}k`,
      live: `$${(1.4 + fn * 0.02).toFixed(1)}k`,
    },
    exclusive: i % 3 === 0 ? '无竞品限制' : '非独家 · 无同期竞品',
    schedule: ['公测周有档', '2 周后有档', '需协调档期'][i % 3],
    risk: {
      ad: ad === 'ok' ? '良好 · 历次均披露' : '待核 · 1 次披露缺失',
      adWarn: ad === 'warn',
      late: ad === 'warn' ? 1 : 0,
      safety: cred,
    },
    samples: Array.from({ length: 3 }, (_, k) => ({
      title: sampleTitle(genre, k),
      views: `${(fn * (0.2 + k * 0.05)).toFixed(0)}万`,
      er: `${(3.0 + k * 0.6).toFixed(1)}%`,
    })),
    judge: {
      match:
        match === null
          ? '受众匹配待核——受众画像数据缺失，待补采后重新评估。'
          : `受众与本季游戏品类匹配 ${match}%，${
              cn >= 90 ? '粉丝真实性高' : '真实性中上'
            }，建议${match >= 80 ? '优先' : '可选'}加入匹配。`,
      reach: `历史响应${resp}，建议开价约 ${priceVideo}k 起；切入点：${sampleHook(genre)}。`,
      comp:
        ad === 'ok'
          ? '#ad 披露历史良好，无品牌安全风险。'
          : '披露历史有 1 次缺失，合作需在合同注明 #ad 与交付时限。',
    },
  };
}

/* ------------------------------------------------------------------ *
 * 溯源契约位（§7.5：行级 dataSource + 字段级 fieldProvenance）
 * ------------------------------------------------------------------ */

/** 抽屉 5 处 ProvenanceTag 的字段路径（CreatorDrawer 经 resolveProvenance 读取） */
export const CREATOR_PROV_FIELDS = {
  audience: 'audienceDemo',
  performance: 'performance',
  commerce: 'commerce',
  compliance: 'compliance',
  samples: 'samples',
} as const;

const FIELD_PROVENANCE = {
  [CREATOR_PROV_FIELDS.audience]: {
    source: 'crawl',
    fetchedAt: '2026-07-17T09:00:00+08:00',
    confidence: 'high',
  },
  [CREATOR_PROV_FIELDS.performance]: {
    source: 'platform_api',
    fetchedAt: '2026-07-19T09:00:00+08:00',
    confidence: 'high',
    detail: '平台一方 API 实测回传',
  },
  [CREATOR_PROV_FIELDS.commerce]: {
    source: 'purchased',
    fetchedAt: '2026-07-01T09:00:00+08:00',
    confidence: 'medium',
    detail: '内部 CRM 历史成交记录',
  },
  [CREATOR_PROV_FIELDS.compliance]: {
    source: 'platform_api',
    fetchedAt: '2026-07-19T09:00:00+08:00',
    confidence: 'high',
    detail: '合规 Agent 基于平台披露记录核验',
  },
  [CREATOR_PROV_FIELDS.samples]: {
    source: 'platform_api',
    fetchedAt: '2026-07-19T09:00:00+08:00',
    confidence: 'high',
    detail: '近 30 天公开内容抓样',
  },
};

/* ------------------------------------------------------------------ *
 * V9 表 9 行（原型 LIBRARY 逐行）+ D2 null 覆盖
 * ------------------------------------------------------------------ */

const ROWS: CreatorRow[] = [
  { id: 'pixelhana', name: 'PixelHana', plat: 'YouTube', fans: '61万', genre: '硬核射击', match: 88, reuse: 2, cred: 'A', ad: 'ok' },
  { id: 'gglong', name: 'GG龙', plat: 'TikTok', fans: '120万', genre: '动作 / 潮流', match: 82, reuse: 1, cred: 'A', ad: 'ok' },
  { id: 'liaoli-xiaolin', name: '料理小林', plat: 'YouTube', fans: '53万', genre: '模拟经营', match: 84, reuse: 2, cred: 'A', ad: 'ok' },
  { id: 'meeplemax', name: 'MeepleMax', plat: 'Twitch', fans: '29万', genre: '生存 / 建造', match: 71, reuse: 3, cred: 'A', ad: 'ok' },
  { id: 'yuna-play', name: '유나Play', plat: 'YouTube', fans: '47万', genre: '射击 / 竞技', match: 79, reuse: 1, cred: 'A', ad: 'ok' },
  { id: 'meng-nongfu', name: '萌农夫', plat: 'Bilibili', fans: '44万', genre: '休闲 / 亲子', match: 80, reuse: 1, cred: 'B', ad: 'ok' },
  { id: 'novamei', name: 'NovaMei', plat: 'Instagram', fans: '38万', genre: '视觉 / 角色', match: 76, reuse: 1, cred: 'B', ad: 'ok' },
  { id: 'arkplays', name: 'ArkPlays', plat: 'YouTube', fans: '39万', genre: '生存 / 教程', match: 73, reuse: 1, cred: 'B', ad: 'warn' },
  // ChefRen：受众数据采集未完成 → match null（表列「待核」，裁决 #2）
  { id: 'chefren', name: 'ChefRen', plat: 'TikTok', fans: '67万', genre: '美食 / 生活', match: null, reuse: 0, cred: 'C', ad: 'warn' },
];

/** D2 深字段 null 覆盖：缺失就是缺失（待接入 / 待补充 / 待核 真实形态） */
const DEEP_NULLS: Record<string, Partial<CreatorDeep>> = {
  // Bilibili 平台 API 未接通 → 内容表现待接入
  'meng-nongfu': { perf: null, deliver: null },
  // CRM 未录入商务信息 → 商务与档期待补充
  novamei: { price: null, exclusive: null, schedule: null },
  // 平台内容样本未同步 → 内容样本待接入
  arkplays: { samples: null },
  // 受众数据采集未完成 → 受众画像待核
  chefren: { aud: null, real: null, active: null },
};

export const mockCreators: MockCreator[] = ROWS.map((row, i) => ({
  ...row,
  dataSource: 'crawl',
  fieldProvenance: FIELD_PROVENANCE,
  deep: { ...buildDeep(row, i), ...(DEEP_NULLS[row.id] ?? {}) },
}));

/* ------------------------------------------------------------------ *
 * KPI ×4 + 筛选 chips（V9；筛选态 URL 化归页面，裁决 #4——本文件只出数据）
 * ------------------------------------------------------------------ */

export interface CreatorKpi {
  id: string;
  name: string;
  value: string;
  /** 无 delta 的 KPI 为 null（两态不得统一，参照 V1 口径） */
  delta: string | null;
}

export const creatorKpis: CreatorKpi[] = [
  { id: 'total', name: '库内创作者', value: '248', delta: '+12' },
  { id: 'reuse', name: '本季度复用', value: '36', delta: '+8' },
  { id: 'match', name: '平均受众匹配', value: '78%', delta: null },
  { id: 'premium', name: '高价值可复用', value: '54', delta: null },
];

export const PLATFORM_FILTERS = ['全部', 'YouTube', 'TikTok', 'Twitch', 'Bilibili'] as const;
export const CATEGORY_FILTERS = ['全部品类', '射击', '模拟经营', '生存建造', '休闲'] as const;

/** 品类归一（'生存 / 建造' → '生存建造'），使「生存建造」chip 能命中带分隔符的 genre */
function normalizeGenre(value: string): string {
  return value.replace(/[\s/]/g, '');
}

export function matchesCreatorFilters(
  creator: MockCreator,
  platform: string,
  category: string,
): boolean {
  const platformOk = platform === PLATFORM_FILTERS[0] || creator.plat === platform;
  const categoryOk =
    category === CATEGORY_FILTERS[0] ||
    normalizeGenre(creator.genre).includes(normalizeGenre(category));
  return platformOk && categoryOk;
}
