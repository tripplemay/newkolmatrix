// ARCH-M05 F006 — 今天页 mock（V1 数据源；原型 interaction-prototype-v2.html
// KPI_TODAY L545 / PROJECTS L546-558 / FEED L602 / viewToday L714-735 逐字转录）。
//
// D2 渲染契约（mock/index.ts 硬规则）：
// - 深字段（ask）一律 unknown，页面经 lib/data/provenance readContractSlot 读取；
//   null = 该项目今天无待办（原型 need=PROJECTS.filter(p=>p.ask) 同语义），绝不填 0 / '' 冒充。
// - URL 化状态（?env=）是路由状态，不入 mock（裁决 #4）。

import { z } from 'zod';
import type { Stage } from 'lib/agent/stage-routing';

/* ------------------------------------------------------------------ *
 * 五环节展示元数据（原型 ENVS L538-544 中文名）
 * icon 不复制：页面经 AGENT_ICONS[STAGE_AGENT[env]] 取既有映射。
 * EXTENSION POINT：F007 详情外壳（导轨）落定后，汇合时统一为单一出处（mock 目录规则 5）。
 * ------------------------------------------------------------------ */
export const ENV_NAME: Record<Stage, string> = {
  brief: '目标 Brief',
  match: '创作者匹配',
  reach: '触达谈判',
  delivery: '交付结算',
  insight: '复盘洞察',
};

/* ------------------------------------------------------------------ *
 * KPI ×4（V1：delta 有/无两态不得统一——null = 无涨幅位）
 * ------------------------------------------------------------------ */
export type TodayKpiIcon = 'bell' | 'spark' | 'folder' | 'trend';

export interface TodayKpi {
  icon: TodayKpiIcon;
  name: string;
  value: string;
  /** 涨幅位：null = 无 delta 的 KPI（进行中项目），MiniStatistics 不渲染该位 */
  delta: string | null;
}

export const todayKpis: TodayKpi[] = [
  { icon: 'bell', name: '待你确认', value: '3', delta: '+1' },
  { icon: 'spark', name: 'Agent 今日完成', value: '24', delta: '+6' },
  { icon: 'folder', name: '进行中项目', value: '4', delta: null },
  { icon: 'trend', name: '本月有效触达', value: '8.4M', delta: '+12%' },
];

/* ------------------------------------------------------------------ *
 * 「需要你确认」雷达（原型 PROJECTS，含 ask 深字段）
 * ------------------------------------------------------------------ */

/** 雷达 ask 深字段 schema（readContractSlot 消费；脏数据降级 null 不抛错） */
export const radarAskSchema = z.object({
  env: z.enum(['brief', 'match', 'reach', 'delivery', 'insight']),
  title: z.string(),
  amt: z.string(),
  /** 🚪 outbound=true → 渲染 irrev「对外不可撤销」红标（V1 条件渲染规则） */
  outbound: z.boolean(),
});
export type RadarAsk = z.infer<typeof radarAskSchema>;

export type ProjectHealth = 'gd' | 'wn' | 'cr';

export interface TodayProject {
  /** 原型 PROJECTS.id（F007 项目详情同源；「进入项目」直落 /admin/campaigns/{id}?env=） */
  id: string;
  name: string;
  /** 游戏名（avatar 首二字来源） */
  game: string;
  market: string;
  budget: string;
  /** health pill 三态（gd 正常 / wn 注意 / cr 风险，不得压缩） */
  health: ProjectHealth;
  /** 深字段：经 radarAskSchema 契约读取；null = 今天无待办，不进雷达 */
  ask: unknown;
}

export const todayProjects: TodayProject[] = [
  {
    id: 'xg',
    name: '《星轨协议》· 全球公测预热',
    game: '星轨协议',
    market: '全球',
    budget: '$18,000',
    health: 'wn',
    ask: {
      env: 'reach',
      title: '审阅并发送 12 封邀约',
      amt: '匹配已批准 · 12 位创作者',
      outbound: true,
    },
  },
  {
    id: 'lc',
    name: '《料理次元》· 日本区上线',
    game: '料理次元',
    market: '日本',
    budget: '$12,000',
    health: 'gd',
    ask: {
      env: 'match',
      title: '批准一组创作者组合',
      amt: '3 组方案待对比',
      outbound: false,
    },
  },
  {
    id: 'aw',
    name: '《暗域拓荒》· Steam 抢先体验',
    game: '暗域拓荒',
    market: 'Steam 全球',
    budget: '$9,000',
    health: 'gd',
    ask: {
      env: 'delivery',
      title: '放款 $1,600 给 MeepleMax',
      amt: '交付证据已齐 · 逐笔',
      outbound: true,
    },
  },
  {
    id: 'mf',
    name: '《萌宠农场》· 北美拉新',
    game: '萌宠农场',
    market: '北美',
    budget: '$7,500',
    health: 'cr',
    ask: null,
  },
];

/* ------------------------------------------------------------------ *
 * 「Agent 活动」feed ×6（原型 FEED L602 逐字）
 * ------------------------------------------------------------------ */
export type TodayFeedIcon = 'check' | 'pen' | 'trend' | 'mail' | 'shield' | 'spark';

export interface TodayFeedItem {
  icon: TodayFeedIcon;
  title: string;
  sub: string;
  time: string;
}

export const todayFeed: TodayFeedItem[] = [
  {
    icon: 'check',
    title: '完成 3,100 位创作者可信度夜间筛查',
    sub: '为 4 个项目刷新候选池',
    time: '06:20',
  },
  {
    icon: 'pen',
    title: '为 6 位创作者起草个性化邀约/回复',
    sub: '《星轨协议》触达谈判',
    time: '12 分钟前',
  },
  {
    icon: 'trend',
    title: '重算全部项目 ROI 与预算消耗',
    sub: '实时同步',
    time: '刚刚',
  },
  {
    icon: 'mail',
    title: '同步 14 条送达 / 打开 / 回复信号',
    sub: '《星轨协议》',
    time: '28 分钟前',
  },
  {
    icon: 'shield',
    title: '拦下 2 笔未达条件的放款',
    sub: '《暗域拓荒》交付结算',
    time: '1 小时前',
  },
  {
    icon: 'spark',
    title: '生成《萌宠农场》复盘草案',
    sub: '等你采纳',
    time: '今晨 06:22',
  },
];

/* ------------------------------------------------------------------ *
 * chartcard：本月 Agent 自动完成（原型 spark 12 点 L715 / L731）
 * ------------------------------------------------------------------ */
export const monthlyAutoDone = {
  label: '本月 Agent 自动完成',
  value: '312',
  delta: '+18%',
  series: [3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10],
} as const;

/* ------------------------------------------------------------------ *
 * 🔒 团队负荷（裁决 #8 / ADR-09：owner 分工标记的工作量分布，不派生权限；
 * 免责 eyebrow「团队负荷 · 单一角色，仅用于分工」由 UI 层逐字渲染，不得省略）
 * ------------------------------------------------------------------ */
export interface TeamLoad {
  name: string;
  percent: number;
}

export const teamLoads: TeamLoad[] = [
  { name: 'Leo', percent: 66 },
  { name: 'Ada', percent: 52 },
  { name: 'Kai', percent: 34 },
];
