// ARCH-M05 F014 — 知识页微区块头（原型 .kb-h / .kb-list-h：11px 加粗大写字距）。
// 与 common/SectionLabel 视觉语义不同（uppercase muted vs gray-600 图标行），故页面域内自持。

import React from 'react';

export default function KbHeading({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`text-micro font-bold uppercase tracking-wide text-gray-400${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </div>
  );
}
