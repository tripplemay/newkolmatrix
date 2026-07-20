// FE-REFACTOR F001 — 标签-值定义行（收敛 ExpertScope / StagePanel 共 4 处同构行）。
// 字号随父容器（text-xs / text-sm），外边距经 className 传入；术语统一：duty=「职责」，isolation=「边界」。

import React from 'react';

export interface DefinitionRowProps {
  label: string;
  tone?: 'default' | 'muted';
  className?: string;
  children: React.ReactNode;
}

export default function DefinitionRow({
  label,
  tone = 'default',
  className,
  children,
}: DefinitionRowProps) {
  return (
    <div className={`flex gap-2${className ? ` ${className}` : ''}`}>
      <span className="shrink-0 font-semibold text-gray-400">{label}</span>
      <span
        className={
          tone === 'muted'
            ? 'text-gray-500 dark:text-gray-400'
            : 'text-gray-700 dark:text-gray-200'
        }
      >
        {children}
      </span>
    </div>
  );
}
