// ARCH-M05 F008 — Brief 环节语法面 mock（V4「态势简报」数据源；原型
// docs/product/interaction-prototype-v2.html SURF.brief L757-769 逐字转录）。
//
// 定名说明：mock/index.ts 目录表 F008 约定名为 env-strategy.ts，落地定名 env-brief.ts——
// 与 components/envs/brief/ 目录及 ?env=brief 状态位对齐（环节 id 是 brief，strategy
// 是背后的策略 Agent，见 stage-routing STAGE_AGENT）。
//
// D2 渲染契约（mock 目录硬规则）：
// - 深字段（gauge / metrics / blocker / trend / timeline）一律 unknown，页面经
//   lib/data/provenance.readContractSlot 读取；null / 校验失败 → 「待接入」占位，
//   绝不抛错 / 填 0。blocker 例外：null = 无阻塞（不渲染阻塞卡，同 today.ask null 语义）。
// - 原型 SURF.brief 是项目不变的静态 canonical 面（原型工具局限，同裁决 #4 注记口径）：
//   四个 canonical 项目共享同一份数据（内容与《星轨协议》xg 一致——300 万曝光 / $18,000 /
//   停在触达谈判均出自 xg 行）；M1 健康度纯函数（health.compute）接入后按 projectId 分流。
// - URL 化状态位（?env=）是路由状态，不入 mock（裁决 #4）。

import { z } from 'zod';
import { getMockProject } from 'lib/data/mock/projects';

/* ------------------------------------------------------------------ *
 * V4-2/3/4 HalfGauge 读数（中央 32px 读数 = `${percent}%`，HalfGauge 内建）
 * ------------------------------------------------------------------ */
export const briefGaugeSchema = z.object({
  /** 达成百分比 0-100（HalfGauge percent） */
  percent: z.number().min(0).max(100),
  /** 副读数（「192万 / 300万 曝光」，逐字） */
  sub: z.string(),
});
export type BriefGauge = z.infer<typeof briefGaugeSchema>;

/* ------------------------------------------------------------------ *
 * V4-5~8 mtile ×4（各含 mt-s 副行——sub 必填，不得省）
 * ------------------------------------------------------------------ */
export const briefMetricTilesSchema = z.array(
  z.object({
    name: z.string(),
    value: z.string(),
    /** mt-s 副行（「剩 $6.5k」族，V4 硬性） */
    sub: z.string(),
  }),
);
export type BriefMetricTile = z.infer<typeof briefMetricTilesSchema>[number];

/* ------------------------------------------------------------------ *
 * 🔒 V4-9 blocker 阻塞卡（琥珀 + alert + 说明句逐字；处置入口走 Copilot——裁决 #1）
 * ------------------------------------------------------------------ */
export const briefBlockerSchema = z.object({
  /** 「1 处阻塞」 */
  title: z.string(),
  text: z.string(),
});
export type BriefBlocker = z.infer<typeof briefBlockerSchema>;

/* ------------------------------------------------------------------ *
 * V4-10 chartcard 曝光趋势（LineAreaChart 12 点，原型 trend L757）
 * ------------------------------------------------------------------ */
export const briefTrendSchema = z.object({
  /** chart-sub（「近 12 天曝光趋势（万）」） */
  sub: z.string(),
  /** chart-big（「192万」） */
  big: z.string(),
  /** chart-badge（「+8%」，绿 badge） */
  badge: z.string(),
  series: z.array(z.number()).min(2),
});
export type BriefTrend = z.infer<typeof briefTrendSchema>;

/* ------------------------------------------------------------------ *
 * V4-11~19 timeline「Agent 推进计划」（tstep done ×2 / 🔒 cur / 未开始 ×1）
 * ------------------------------------------------------------------ */
export const briefTimelineSchema = z.array(
  z.object({
    /** 三态：done 绿实心 / cur 紫+4px 光晕（brand 加粗）/ todo 灰空心（不得压缩） */
    state: z.enum(['done', 'cur', 'todo']),
    title: z.string(),
    desc: z.string(),
    /** who 行文案（cur 态「需要你 · 在「触达谈判」」逐字） */
    who: z.string(),
  }),
);
export type BriefTimelineStep = z.infer<typeof briefTimelineSchema>[number];

/* ------------------------------------------------------------------ *
 * 实体形状：深字段一律 unknown（页面经 readContractSlot 消费）
 * ------------------------------------------------------------------ */
export interface EnvBrief {
  /** 深字段：briefGaugeSchema；null = 待接入 */
  gauge: unknown;
  /** 深字段：briefMetricTilesSchema；null = 待接入 */
  metrics: unknown;
  /** 深字段：briefBlockerSchema；null = 无阻塞（不渲染阻塞卡） */
  blocker: unknown;
  /** 深字段：briefTrendSchema；null = 待接入 */
  trend: unknown;
  /** 深字段：briefTimelineSchema；null = 待接入 */
  timeline: unknown;
}

// 原型 SURF.brief canonical 数据（文案 / 数值逐字，L757-768）。
// satisfies 提供编译期自查，字段仍以 unknown 形状交给契约层（D2）。
const canonicalBrief: EnvBrief = {
  gauge: { percent: 64, sub: '192万 / 300万 曝光' } satisfies BriefGauge,
  metrics: [
    { name: '预算消耗', value: '$11.5k', sub: '剩 $6.5k' },
    { name: '时间进度', value: '57%', sub: '剩 13 天' },
    { name: '在谈创作者', value: '12', sub: '2 已确认' },
    { name: '已发内容', value: '6', sub: '4 待审' },
  ] satisfies BriefMetricTile[],
  blocker: {
    title: '1 处阻塞',
    text: '硬核射击向创作者开播率低于预期，Agent 建议补充 2 位直播首曝位。',
  } satisfies BriefBlocker,
  trend: {
    sub: '近 12 天曝光趋势（万）',
    big: '192万',
    badge: '+8%',
    series: [120, 132, 128, 145, 150, 148, 162, 170, 168, 178, 185, 192],
  } satisfies BriefTrend,
  timeline: [
    {
      state: 'done',
      title: '目标与预算确认',
      desc: 'Leo 于上周确认 $18,000 上限',
      who: '已完成',
    },
    {
      state: 'done',
      title: '创作者组合已批准',
      desc: '均衡组 12 人 · $11,800 生效',
      who: '已完成',
    },
    {
      state: 'cur',
      title: '触达谈判中',
      desc: '已起草 7 封邀约，12 封待你审阅发送',
      who: '需要你 · 在「触达谈判」',
    },
    {
      state: 'todo',
      title: '交付与结算',
      desc: '内容交付后逐笔核对放款条件',
      who: '未开始',
    },
  ] satisfies BriefTimelineStep[],
};

// 未知项目：全 null 深字段 → 页面渲染「待接入」占位（D2，绝不抛错）。
const emptyBrief: EnvBrief = {
  gauge: null,
  metrics: null,
  blocker: null,
  trend: null,
  timeline: null,
};

/**
 * 按项目取态势简报数据：经 projects.ts 单一出处解析（含旧 demo id 兼容，
 * mock 目录规则 5——跨页共用实体不复制）。
 *
 * M1-B F002（D3）机械分流：canonicalBrief 的内容全部出自《星轨协议》xg 行
 *（300 万曝光 / $18,000 / 停在触达谈判），故**仅 xg 可得它**；lc/aw/mf 无真数据源，
 * 一律 emptyBrief → 页面渲染「待接入」占位（readContractSlot null 降级，绝不抛错）。
 * 不为 lc/aw/mf 补写 mock——补即造假数据（projects.ts:5「绝不填 0/'' 冒充实测」）。
 * 修复前四项目共享同一 canonicalBrief 引用，mf 头部与面内数据打架（线上真 bug）。
 */
export function getEnvBrief(projectId: string): EnvBrief {
  return getMockProject(projectId)?.id === 'xg' ? canonicalBrief : emptyBrief;
}
