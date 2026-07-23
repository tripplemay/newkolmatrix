// M3-A-REACH-CRM F008 — V6 触达面显示契约（RSC 组装 → 可序列化视图；沿 match-format 先例）
//
// mock env-reach.ts 退役后，五态中文词与 pill 色调映射迁居此处（原型逐字沿用）。
// 五态 pill = crmInfer 真值：surface-data 装配时经 `inferCrmStatus` 纯函数推断
//（三处复用铁律 ①——V6 页面），本文件只做「枚举 → 中文 + tone」的机械映射。

import type { ReachStatus } from 'lib/domain/crm-infer';

/** 原型五态中文词（interaction-prototype-v2.html L560-576 逐字）。 */
export type ReachStageLabel =
  | '待发送'
  | '已发送'
  | '已回复'
  | '谈判中'
  | '已确认';

export type ReachStageTone = 'gd' | 'wn' | 'ac' | 'nu';

/** ReachStatus → 原型中文词。 */
export const REACH_STATUS_LABEL: Record<ReachStatus, ReachStageLabel> = {
  pending_send: '待发送',
  sent: '已发送',
  replied: '已回复',
  negotiating: '谈判中',
  confirmed: '已确认',
};

/** pill 色调（mock REACH_STAGE_TONE 原值迁入，原型逐字）。 */
export const REACH_STAGE_TONE: Record<ReachStageLabel, ReachStageTone> = {
  待发送: 'nu',
  已发送: 'nu',
  已回复: 'ac',
  谈判中: 'wn',
  已确认: 'gd',
};

/** 中栏对话气泡（原型 .msg in/out + .mt 时间戳）。 */
export interface ReachMessageView {
  who: 'in' | 'out';
  t: string;
  at: string;
}

/** 草稿视图（最新 direction=draft 行；裁决 #3）。 */
export interface ReachDraftView {
  subject: string | null;
  body: string;
}

/** 左栏一行 = 一位创作者的触达视图（真 thread 或 approved 组合成员虚拟行，裁决 #5）。 */
export interface ReachPersonView {
  kolId: string;
  threadId: string | null;
  name: string;
  /** 「平台 · 粉丝量」串（原型 plat.split(' · ') 消费）。 */
  plat: string;
  /** crmInfer 真值（枚举）。 */
  status: ReachStatus;
  /** 原型中文词（= REACH_STATUS_LABEL[status]，装配时算好防客户端漂移）。 */
  stage: ReachStageLabel;
  /** 左栏 last 预览：最近一条往来 / 草稿摘要 / 空串。 */
  last: string;
  draft: ReachDraftView | null;
  messages: ReachMessageView[];
  /** 受众匹配 0-100；缺失 null → 「待核」（裁决 #2）。 */
  match: number | null;
  /** 历史合作（本批无真数据源 → '—' 占位，guardrail：保留结构不删）。 */
  past: string;
  /** 是否已录联系邮箱（P3：未录时发送会被明示拒绝，UI 可预提示）。 */
  hasContactEmail: boolean;
  language: string | null;
}

export interface ReachSurfaceData {
  people: ReachPersonView[];
}

/** 空表（降级/CI 无库时的安全值）。 */
export const EMPTY_REACH_SURFACE: ReachSurfaceData = { people: [] };
