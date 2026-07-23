// M2-B-CREATORS F004/F005 — 创作者视图契约 + 展示串格式化单点（match-format 先例）。
//
// 视图形状沿 mock/creators.ts（退役）的 CreatorDeep 结构逐字段保持（drawer 布局零变更
// 的类型基座），差异只有两类（均为接真的诚实化）：
// 1. 可空化：real 无源的字段从必填改 nullable（reuse/resp/last/judge.reach 等）——
//    显示层「—/待接入/待补充/待核」降级（FR-11.17 缺值不用 0/'' 冒充）；
// 2. aud 扩 interests：真源只有创作者标签派生的兴趣列表（audienceDemo.interests），
//    分布三键（region/age/gender）与 games 占比无源 → 逐子块「待接入」降级（F005 ①）。
//
// 「待核」口径（裁决 #2）：字段缺失/契约层 null 唯一触发；cred=null → 待核、
// match 库级恒 null（P5 无项目上下文不编造）。

import type { Kol } from '@prisma/client';
import {
  parseAudienceDemo,
  parseBrandSafety,
  parseCredibility,
} from 'lib/data/schemas/kol-deep';
import { formatPlat, formatWan } from 'lib/display/match-format';

/* ------------------------------------------------------------------ *
 * 视图类型（原 mock CreatorDeep 同形 + 可空化）
 * ------------------------------------------------------------------ */

export type CredGrade = 'A' | 'B' | 'C';

export interface CreatorShare {
  label: string;
  pct: number;
}

/** ① 受众画像（各子块独立可空 → 逐子块降级；interests = 真源唯一有值位） */
export interface CreatorAudienceView {
  /** 兴趣标签（audienceDemo.interests，crawl 规则派生）；null → 待接入 */
  interests: string[] | null;
  region: CreatorShare[] | null;
  age: CreatorShare[] | null;
  games: CreatorShare[] | null;
  gender: [number, number] | null;
}

export interface CreatorPerfView {
  plays: string;
  er: string;
  cr: string;
  trend: number[];
}

export interface CreatorDeliverView {
  reach: string;
  conv: string;
  cpm: string;
}

export interface CreatorCollabView {
  proj: string;
  form: string;
  price: string;
  quality: string;
}

export interface CreatorPriceView {
  video: string;
  short: string;
  live: string;
}

export interface CreatorRiskView {
  /** #ad 披露描述；null → 待接入 */
  ad: string | null;
  adWarn: boolean;
  /** 延迟交付次数；null → 无 CRM 源 */
  late: number | null;
  /** 品牌安全/可信分级；null → 待核 */
  safety: CredGrade | null;
}

export interface CreatorSampleView {
  title: string;
  views: string;
  er: string;
}

export interface CreatorJudgeView {
  match: string;
  /** null → 待接入（触达判断依赖 CRM/报价数据，M3） */
  reach: string | null;
  /** null → 待接入（合规判断依赖 brandSafety 源） */
  comp: string | null;
}

export interface CreatorDeepView {
  aud: CreatorAudienceView | null;
  /** 可信度 ring（credibility.score 0-100，crawl 弱信号规则合成）；null → 待核 */
  real: number | null;
  /** 活跃度 ring；null → 待核（无源） */
  active: number | null;
  perf: CreatorPerfView | null;
  deliver: CreatorDeliverView | null;
  collab: CreatorCollabView[];
  rival: string[];
  resp: string | null;
  last: string | null;
  price: CreatorPriceView | null;
  exclusive: string | null;
  schedule: string | null;
  risk: CreatorRiskView;
  samples: CreatorSampleView[] | null;
  judge: CreatorJudgeView;
}

/** 表行 + 抽屉数据（V9 8 列 + 溯源契约位 §7.5，可序列化） */
export interface CreatorView {
  id: string;
  publicId: string;
  name: string;
  plat: string;
  fans: string;
  genre: string;
  /** 受众匹配 %；库级恒 null → 「待核」（P5 无项目上下文不编造） */
  match: number | null;
  /** 历史合作项目数；null → 无 CRM 源（显示 —，不用 0 冒充 FR-11.17） */
  reuse: number | null;
  /** 可信分级；null → 待核 */
  cred: CredGrade | null;
  ad: 'ok' | 'warn';
  /** M3-A F007（P3）：联系邮箱——抽屉人工录入，send_outreach 收件地址源；null → 待补充 */
  contactEmail: string | null;
  dataSource: unknown;
  fieldProvenance: unknown;
  deep: CreatorDeepView;
}

/* ------------------------------------------------------------------ *
 * 溯源字段路径（抽屉 5 处 ProvenanceTag；原 mock CREATOR_PROV_FIELDS 迁入）
 * ------------------------------------------------------------------ */

/** 抽屉 5 处 ProvenanceTag 的字段路径（CreatorDrawer 经 resolveProvenance 读取）。
 *  compliance → 'brandSafety'（接真校准：mock 时代的 'compliance' 键在真 fieldProvenance
 *  中不存在——合规区溯源对象就是 brandSafety 契约位）。 */
export const CREATOR_PROV_FIELDS = {
  audience: 'audienceDemo',
  performance: 'performance',
  commerce: 'commerce',
  compliance: 'brandSafety',
  samples: 'samples',
} as const;

/* ------------------------------------------------------------------ *
 * 分级 / 格式化（常量导出可测）
 * ------------------------------------------------------------------ */

/** credibility.score → A/B/C 分级阈值（示意值，上线校准——HEALTH_THRESHOLDS 先例）。 */
export const CRED_GRADE_THRESHOLDS = {
  /** ≥ 此分为 A */
  A: 85,
  /** ≥ 此分为 B，低于则 C */
  B: 70,
} as const;

export function resolveCredGrade(score: number): CredGrade {
  if (score >= CRED_GRADE_THRESHOLDS.A) return 'A';
  if (score >= CRED_GRADE_THRESHOLDS.B) return 'B';
  return 'C';
}

/* ------------------------------------------------------------------ *
 * Kol 行 → 视图（纯函数，page-data 组装层调用）
 * ------------------------------------------------------------------ */

/** kolToCreatorView 入参（prisma Kol 行的纯数据子集，便于单测不打库）。 */
export type KolRowLike = Pick<
  Kol,
  | 'id'
  | 'publicId'
  | 'displayName'
  | 'handle'
  | 'platform'
  | 'followers'
  | 'categories'
  | 'contactEmail'
  | 'audienceDemo'
  | 'credibility'
  | 'brandSafety'
  | 'dataSource'
  | 'fieldProvenance'
>;

export function kolToCreatorView(kol: KolRowLike): CreatorView {
  const demo = parseAudienceDemo(kol.audienceDemo);
  const cred = parseCredibility(kol.credibility);
  const safety = parseBrandSafety(kol.brandSafety);

  const credGrade = cred ? resolveCredGrade(cred.score) : null;
  const interests = demo?.interests ?? null;

  return {
    id: kol.id,
    publicId: kol.publicId,
    name: kol.displayName ?? kol.handle ?? '（未命名）',
    plat: formatPlat(kol.platform, kol.followers),
    fans: formatWan(kol.followers),
    genre: kol.categories[0] ?? '—',
    match: null, // P5：库级无项目上下文恒待核
    reuse: null, // 无 CRM 源（M3）
    cred: credGrade,
    // brandSafety 有值且 safe → 合规；其余（null/review/risk）→ 待核（现有二态 UI 语义）
    ad: safety?.rating === 'safe' ? 'ok' : 'warn',
    // M3-A F007：抽屉行内录入的读侧（?? null 兜历史 KolRowLike 夹具缺键）
    contactEmail: kol.contactEmail ?? null,
    dataSource: kol.dataSource,
    fieldProvenance: kol.fieldProvenance,
    deep: {
      aud: interests
        ? { interests, region: null, age: null, games: null, gender: null }
        : null,
      real: cred?.score ?? null,
      active: null,
      perf: null, // 平台 API 未接（待接入）
      deliver: null,
      collab: [], // 无 CRM：空态真话「与我方暂无合作记录。」
      rival: [],
      resp: null,
      last: null,
      price: null, // CRM 未录入（待补充，M3）
      exclusive: null,
      schedule: null,
      risk: {
        ad: safety ? `#ad 披露评级 ${safety.rating}` : null,
        adWarn: safety != null && safety.rating !== 'safe',
        late: null,
        safety: credGrade,
      },
      samples: null, // 内容抓样未接（待接入）
      judge: {
        match:
          '受众匹配待核——库级无项目上下文；进入项目「创作者匹配」环节后由匹配 Agent 评估。',
        reach: null,
        comp: null,
      },
    },
  };
}
