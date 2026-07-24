// M4-INSIGHT F006 — draft_report 工具（internal/native，gateway chat 长文起草）
//
// class:'internal'：起草只落 WeeklyReport(adopted=false) 草案——本系统内可撤销（P5），
// 不产生 PendingAction、无 buildHarm。真正对外 = create_share_link（F008，outbound 过闸门）。
// 起草/落库/覆盖策略/降级语义全在 lib/insight/weekly-report.ts 服务层（例程 weekly-draft F011
// 与本工具共用同一服务——单一起草实现，无旁路）。
// 输出可序列化（JSON 往返无损，供画布渲染）。

import { z } from 'zod';
import {
  draftWeeklyReport,
  type DraftWeeklyReportResult,
} from 'lib/insight/weekly-report';
import type { ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .nullish()
    .describe(
      '项目 id；省略或 null = 跨项目周报（V12「采纳为周报」），非空 = 项目级复盘（V8「采纳结论」）',
    ),
  period: z
    .string()
    .regex(/^\d{4}-W\d{2}$/, 'period 形如 2026-W30')
    .optional()
    .describe('周期串（ISO 周，如 2026-W30）；省略取当前周'),
});

type DraftReportInput = z.infer<typeof inputSchema>;

export const draftReportTool: ToolDefinition<
  DraftReportInput,
  DraftWeeklyReportResult
> = {
  name: 'draft_report',
  description:
    '基于库内真实度量事实（spend 真源 + 证据缺口）起草周报草案并落库（adopted=false）。只起草不采纳——采纳由你在页面上确认；对外分享须经 create_share_link 过闸门。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: (input, ctx) =>
    draftWeeklyReport(
      { projectId: input.projectId ?? null, period: input.period },
      { tenantId: ctx.tenantId, db: ctx.db },
    ),
};
