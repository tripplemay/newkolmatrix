// ARCH-M05 F009 — Match 环节「对比矩阵」语法面 mock（原型 interaction-prototype-v2.html
// COMPOS L577-581 / FUZZY L582-587 逐字转录；ui-inventory V5 / architecture.md §6.3 Match 行）。
//
// D2 渲染契约：页面经 lib/data/provenance.readContractSlot 读取 raw（unknown）导出，
// 校验失败 / 缺失 → null → 占位渲染（绝不抛错、绝不填 0 / '' 冒充实测）。
//
// 「待核」口径（裁决 #2）：唯一触发条件 = 字段缺失 / 契约层 null。原型 FUZZY 中
// match:'待核' 的两行按契约写 null，由 isPendingVerification 机械判定后渲染
// PENDING_TEXT.verify——mock 不写「待核」字面量冒充数据值（低置信度不显裸分）。
//
// 溯源契约位说明（mock/index.ts 规则 3 边界）：V5 无 ProvenanceTag 元素（矩阵与候选表
// 均不渲染溯源徽标），故本文件实体不带 §7.5 { dataSource, fieldProvenance } 契约位
//（同 runs.ts 先例）。真数据源归 M2：MatchPlan / PlanKol / MatchCandidate
//（architecture.md §7.2 目标态——metrics{触达/预算/风险/规模} + rationale + recommended）。

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * 组合方案（原型 COMPOS → M2 目标态 MatchPlan）
 * ------------------------------------------------------------------ */

export const matchPlanSchema = z.object({
  id: z.string(),
  /** 组合名（col-h 主行 + 批准 toast 点名） */
  name: z.string(),
  /** ★ Agent 推荐位：仅 1 组 best（渐变高亮列 + 实心批准钮 + pick 贯穿底色） */
  best: z.boolean(),
  /** 指标行 ×4（展示串：触达 / 预算 / 风险 / 规模） */
  reach: z.string(),
  cost: z.string(),
  risk: z.string(),
  people: z.string(),
  /** 🔒 minibars 6 根迷你柱档位（0-9；>=7 满色 hi，其余 35% 不透明度，纯 CSS） */
  bars: z.array(z.number().min(0).max(9)).length(6),
  /** 🔒 「依据」推荐理由段 */
  basis: z.string(),
});
export type MatchPlan = z.infer<typeof matchPlanSchema>;

/** 矩阵固定 130px 行标 + 3 组合列（V5），schema 锁 3 组（同 insight KPI .length(4) 先例） */
export const matchPlanListSchema = z.array(matchPlanSchema).length(3);

/** 原型 COMPOS（L577-581）逐字。 */
export const mockMatchPlans: unknown = [
  {
    id: 'a',
    name: 'A · 生活流精投组',
    best: false,
    reach: '240万',
    cost: '$11,000',
    risk: '低',
    people: '10 人',
    bars: [4, 6, 5, 7, 5, 6],
    basis: '女性向生活玩家占比高，但缺 2 位美食头部',
  },
  {
    id: 'b',
    name: 'B · 均衡组',
    best: true,
    reach: '268万',
    cost: '$11,800',
    risk: '低',
    people: '13 人',
    bars: [5, 7, 6, 8, 7, 8],
    basis: '覆盖与预算平衡，日区模拟经营受众匹配 74%',
  },
  {
    id: 'c',
    name: 'C · 头部拉动组',
    best: false,
    reach: '305万',
    cost: '$14,600',
    risk: '中',
    people: '8 人',
    bars: [8, 6, 9, 5, 8, 4],
    basis: '触达最高但超预算 $2,600，需预算例外',
  },
];

/* ------------------------------------------------------------------ *
 * 「Agent 拿不准 · 待你裁定」候选（原型 FUZZY → M2 目标态 MatchCandidate）
 * ------------------------------------------------------------------ */

export const matchCandidateSchema = z.object({
  name: z.string(),
  /** who 副行：平台 · 粉丝（展示串） */
  plat: z.string(),
  /**
   * 受众匹配展示值二形态（🔒 裁决 #2）：null = 字段缺失 → 「待核」
   *（isPendingVerification 判定，低置信度不显裸分）；有值即显（'68%'）。
   */
  match: z.string().nullable(),
  /** 存疑原因（灰字） */
  why: z.string(),
  /** 初判 pill 三态（高 gd / 中 wn / ? nu，不得合并） */
  fit: z.enum(['高', '中', '?']),
});
export type MatchCandidate = z.infer<typeof matchCandidateSchema>;

export const matchCandidateListSchema = z.array(matchCandidateSchema);

/** 原型 FUZZY（L582-587）逐字；match:'待核' 两行按裁决 #2 转写 null。 */
export const mockMatchCandidates: unknown = [
  {
    name: '미유쿡',
    plat: 'YouTube · 42만',
    match: null,
    why: '受众地域数据缺失，日区占比待核',
    fit: '?',
  },
  {
    name: 'ChefRen',
    plat: 'TikTok · 67万',
    match: '68%',
    why: '历史合作有 1 次延迟交付记录',
    fit: '中',
  },
  {
    name: '和风料理',
    plat: 'Bilibili · 51万',
    match: null,
    why: '粉丝真实性置信度偏低，需人工看',
    fit: '?',
  },
  {
    name: 'Yuki Cooks',
    plat: 'Instagram · 29万',
    match: '73%',
    why: '内容合规历史良好，仅报价略高',
    fit: '高',
  },
];
