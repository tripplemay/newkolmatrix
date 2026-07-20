// FE-REFACTOR F002 — 页面头（H1 + 灰副标题），收敛 4 处同构头部
// （today / campaigns / ProjectDetail / ComingSoon，差异仅外边距与对齐，经 className/align 表达）。

import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'left' | 'center';
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  align = 'left',
  actions,
  className,
}: PageHeaderProps) {
  const head = (
    <div className={align === 'center' ? 'text-center' : undefined}>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
        {title}
      </h1>
      {subtitle != null && (
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      )}
    </div>
  );
  if (actions != null) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2${className ? ` ${className}` : ''}`}
      >
        {head}
        {actions}
      </div>
    );
  }
  return className ? <div className={className}>{head}</div> : head;
}
