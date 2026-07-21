// P2-CLEANUP F004 — 协同交接面板容器 chrome（BL-FE-14）。
//
// 从 copilot/HandoffCollab 与 preview/agent-canvas 两处抽出共同的容器外壳：
// SurfaceCard + SectionLabel + MdGroups + 标签文案 + 多卡 flex 容器。
// 呈现层（单张卡）仍在 common/HandoffCard —— 本组件只管「卡以外」的那一圈。
//
// 三处原有分叉按 spec D4 显式作为 props 容纳，不靠夹具将就：
//   1. border-dashed —— `dashed`，缺省 true（生产口径 ARCH-M05 F003 S3-9）；
//      夹具经本 feature 对齐到同一口径，此前它无虚线框、守的不是生产实际外观。
//   2. stage 三元文案 —— `stage`，命中环节上下文时切「本环节协同」，否则「协同交接」。
//   3. 多卡 flex 容器 —— 一律由本组件提供，单张卡亦走同一路径（此前夹具直接裸放一张卡）。

import React from 'react';
import { MdGroups } from 'react-icons/md';
import SectionLabel from './SectionLabel';
import SurfaceCard from './SurfaceCard';

export interface HandoffPanelProps {
  /**
   * 项目详情环节（?env=）。有值 → 标签走「本环节协同」文案；null/缺省 → 「协同交接」。
   * 生产此前写在 HandoffCollab 的三元里，收敛至此以免两处文案漂移。
   */
  stage?: string | null;
  /** 虚线框容器（生产口径，缺省 true）。分叉以 prop 形式保留，避免把口径硬编死。 */
  dashed?: boolean;
  /** 一或多张 HandoffCard */
  children: React.ReactNode;
}

export default function HandoffPanel({
  stage = null,
  dashed = true,
  children,
}: HandoffPanelProps) {
  return (
    <SurfaceCard className={`${dashed ? 'border-dashed ' : ''}p-3`}>
      <SectionLabel className="mb-2">
        <MdGroups size={15} className="text-brand-500" />
        {stage
          ? '本环节协同 · 多 Agent 联动 · 点开看交接'
          : '协同交接 · 多 Agent 联动 · 点开看交接'}
      </SectionLabel>
      <div className="flex flex-col gap-1.5">{children}</div>
    </SurfaceCard>
  );
}
