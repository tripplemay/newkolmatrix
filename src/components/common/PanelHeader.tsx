// FE-REFACTOR F002 — 面板头（主标题 + 微副标题），收敛 2 处字面量重复的 Copilot 面板头
// （CopilotPanel 常驻侧栏 / agent-canvas 预览，外框差异经 className 表达）。

import React from 'react';

export interface PanelHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}

export default function PanelHeader({
  title,
  subtitle,
  className,
}: PanelHeaderProps) {
  return (
    <div className={className}>
      <div className="text-sm font-bold text-navy-700 dark:text-white">
        {title}
      </div>
      {subtitle != null && (
        <div className="text-[11px] text-gray-400">{subtitle}</div>
      )}
    </div>
  );
}
