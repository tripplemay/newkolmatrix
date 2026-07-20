// FE-REFACTOR F004 — 轻量卡片表面：统一自写卡片的表面语言（BL-FE-05）。
// 规则：rounded-2xl + border 分界，不用 shadow-sm/md（模板生产代码零次的词表）；
// 可点卡片 hover 统一 hover:shadow-xl（用户拍板）。嵌套小表面不硬套模板 Card
//（20px 圆角 + 重阴影，FE-AUDIT F001 §4 结论），此组件即为其轻量替代。

import React from 'react';

export interface SurfaceCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** 可点/可悬停卡片：附加 transition + hover:shadow-xl */
  interactive?: boolean;
}

export default function SurfaceCard({
  interactive = false,
  className,
  children,
  ...rest
}: SurfaceCardProps) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700${
        interactive ? ' transition hover:shadow-xl' : ''
      }${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}
