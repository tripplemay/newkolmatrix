// M4-INSIGHT F011 — weekly-draft 例程执行体（P6：每周汇总跨项目数据 → 起草周报草案落库）。
//
// 执行体 = lib/insight/weekly-report.ts 的 draftWeeklyReport 服务（与 draft_report 工具共用
// 同一起草实现，非旁路）：汇总跨项目度量（F004 装配 + F002 roi + F003 gaps，三处复用③）→
// gateway chat 起草 → WeeklyReport(projectId=null, adopted=false) 落库。
//
// 例程边界（architecture :1182）：只跑 internal 类——起草只落草案，无任何 outbound 直通
// （对外分享须人经 create_share_link 闸门）。无网关凭据 → 服务层降级固定草案（明示不静默）。
//
// 幂等/可重入：同周期重跑走服务层覆盖策略（未采纳覆盖同一行不堆重复；已采纳冻结跳过），
// 与互斥锁（runExclusive）双层保障。

import { draftWeeklyReport } from 'lib/insight/weekly-report';

export interface WeeklyDraftResult {
  period: string;
  reportId: string;
  /** true = 无凭据降级固定草案（明示） */
  degraded: boolean;
  /** true = 同周期已采纳，未重新起草（采纳结论冻结） */
  skippedAdopted: boolean;
}

/** 跨项目周报起草一轮（scope = 全租户，projectId=null，P10 双态之跨项目态）。 */
export async function runWeeklyDraft(
  tenantId: string,
): Promise<WeeklyDraftResult> {
  const r = await draftWeeklyReport({ projectId: null }, { tenantId });
  return {
    period: r.period,
    reportId: r.reportId,
    degraded: r.degraded,
    skippedAdopted: r.skippedAdopted,
  };
}
