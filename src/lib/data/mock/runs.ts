// ARCH-M05 F016 — Agent 记录页 mock（原型 interaction-prototype-v2.html RUNLOG L653-664 逐字转录）。
//
// 字段契约对齐 as-built OperationLog 7 列（architecture.md §7.7）的展示子集：
//   at = createdAt（展示串）· actor = OperationLog.actor（AgentId）·
//   summary = OperationLog.summary · kind = OperationLogKind 四态；
//   id / tenantId / ref 为服务端列，不入展示契约。M1 接真 OperationLog 时换数据源，UI 零返工。
//
// 留痕行是系统一方事实（审计记录），as-built 无 dataSource/fieldProvenance 列——
// 不属于 §7.5 溯源实体，不适用 mock/index.ts 规则 3 的溯源契约位要求。
// 四态样例齐全：auto ×5 · gate ×1 · block ×1 · irrev ×3（V13 类型 pill 四态不得合并）。

import { z } from 'zod';
import { isAgentId, type AgentId } from 'lib/agent/registry';

/** OperationLogKind 四态（architecture.md §7.2.1 enum，as-built）。 */
export const runKindSchema = z.enum(['auto', 'gate', 'block', 'irrev']);
export type RunKind = z.infer<typeof runKindSchema>;

export const runRowSchema = z.object({
  /** 展示用时间串（真数据 = createdAt 格式化） */
  at: z.string(),
  /** OperationLog.actor（agentId，registry 7 人格校验） */
  actor: z.custom<AgentId>((v) => typeof v === 'string' && isAgentId(v)),
  /** OperationLog.summary（人类可读一句话） */
  summary: z.string(),
  kind: runKindSchema,
});
export type RunRow = z.infer<typeof runRowSchema>;

export const runLogSchema = z.array(runRowSchema);

/** KPI 契约位：值缺失一律 null（D2：渲染「待接入」，绝不填 0 冒充实测）。 */
export const runKpiValuesSchema = z.object({
  autoToday: z.string().nullable(),
  gatePending: z.string().nullable(),
  blocked: z.string().nullable(),
  irrevLogged: z.string().nullable(),
});
export type RunKpiValues = z.infer<typeof runKpiValuesSchema>;

/** 原型 viewRuns() kpi 四值（L881）——全部无 delta，不得补涨跌幅（V13-3）。 */
export const mockRunKpiValues: RunKpiValues = {
  autoToday: '24',
  gatePending: '3',
  blocked: '2',
  irrevLogged: '3',
};

/** 原型 RUNLOG（L653-664）逐字转录，append-only 时间倒序。 */
export const mockRunLog: RunRow[] = [
  {
    at: '今天 09:32',
    actor: 'reach',
    summary: '起草 12 封个性化邀约草稿',
    kind: 'auto',
  },
  {
    at: '今天 09:18',
    actor: 'match',
    summary: '筛查 3,100 位创作者，生成 3 组方案',
    kind: 'auto',
  },
  {
    at: '今天 08:55',
    actor: 'delivery',
    summary: '拦截 ArkPlays 放款：缺 #ad 披露',
    kind: 'block',
  },
  {
    at: '昨天 21:40',
    actor: 'reach',
    summary: '发送邀约给 GG龙（你已确认）',
    kind: 'irrev',
  },
  {
    at: '昨天 20:12',
    actor: 'delivery',
    summary: '放款 $1,600 给 MeepleMax（你已确认）',
    kind: 'irrev',
  },
  {
    at: '昨天 18:30',
    actor: 'compliance',
    summary: '复核 PixelHana 授权范围：通过',
    kind: 'auto',
  },
  {
    at: '昨天 16:05',
    actor: 'strategy',
    summary: '生成《萌宠农场》复盘草案',
    kind: 'auto',
  },
  {
    at: '昨天 14:20',
    actor: 'reach',
    summary: '确认报价 $3,400 给 PixelHana（你已确认）',
    kind: 'irrev',
  },
  {
    at: '昨天 11:48',
    actor: 'insight',
    summary: '重算全部项目 ROI 与归因',
    kind: 'auto',
  },
  {
    at: '昨天 09:15',
    actor: 'match',
    summary: '标记 2 位存疑候选，移入待裁定',
    kind: 'gate',
  },
];
