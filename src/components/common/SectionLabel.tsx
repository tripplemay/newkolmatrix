// FE-REFACTOR F002 — 卡内区块头（图标 + 小标题），收敛 3 处同构区块头
// （today「需要你确认」/ HandoffCollab / agent-canvas 预览，差异仅字号与外边距）。

import React from 'react';

export interface SectionLabelProps {
  size?: 'xs' | 'sm';
  className?: string;
  children: React.ReactNode;
}

export default function SectionLabel({
  size = 'xs',
  className,
  children,
}: SectionLabelProps) {
  return (
    <div
      className={`flex items-center gap-1.5 font-semibold text-gray-600 ${
        size === 'sm' ? 'text-sm' : 'text-xs'
      }${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
