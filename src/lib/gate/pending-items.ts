// M4.5-AGENT-LOOP F007 — 聚合确认卡的数据形状（服务端装配，可序列化）
//
// 由 aggregatePending 的原始行装配成卡片直接可渲染的形状。**harm 原样透传不改写**
//（§9.5：确认面只呈现服务端 harm，不筛选、不摘要、不软化）——聚合卡要把每一条的
// 利害列全（D28 无阈值分级、批量不折叠），而不是「N 件动作，点开看详情」。

import { harmSchema, type Harm } from 'lib/agent/gate/harm';
import type { PendingItem } from 'lib/agent/orchestrator';

export interface PendingBatchItem {
  id: string;
  toolName: string;
  agentId: string | null;
  projectId: string | null;
  createdAt: string;
  /** 服务端 harm 原样（解析失败 → null，卡上如实标「利害披露不可读」而非静默隐藏）。 */
  harm: Harm | null;
}

export function toPendingBatchItems(rows: PendingItem[]): PendingBatchItem[] {
  return rows.map((r) => {
    const parsed = harmSchema.safeParse(r.harm);
    return {
      id: r.id,
      toolName: r.toolName,
      agentId: r.agentId ?? null,
      projectId: r.projectId ?? null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
      harm: parsed.success ? parsed.data : null,
    };
  });
}
