// M1-C F003 — Agent 图标映射（server-safe 单点）。
//
// 原 export 于 AgentSquad.tsx（'use client'）——RSC 无法从 client 模块 import
// 非组件导出，今天页转 RSC 后须迁出至无指令模块。AgentSquad 从此处 import
// 并保留 re-export（CopilotPanel 等既有 client 消费方零改动）。

import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdGroups,
  MdInsights,
  MdMailOutline,
  MdOutlineGpsFixed,
  MdOutlineReceiptLong,
  MdShield,
} from 'react-icons/md';
import type { AgentId } from 'lib/agent/registry';

/** Agent 图标映射（原型 AGENTS.ic → react-icons）；cop-head dm 图标块复用同一映射。 */
export const AGENT_ICONS: Record<AgentId, IconType> = {
  orchestrator: MdAutoAwesome, // spark
  strategy: MdOutlineGpsFixed, // target
  match: MdGroups, // users
  reach: MdMailOutline, // mail
  delivery: MdOutlineReceiptLong, // ledger
  insight: MdInsights, // chart
  compliance: MdShield, // shield
};
