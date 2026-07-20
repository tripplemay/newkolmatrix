// FE-REFACTOR F001 — 统一 brand 药丸徽标（收敛 6 处手写 class 串，含 campaigns 列表尺寸漂移修复）。
// 视觉规格以收敛前多数派为准：soft/xs 为 canonical 形态。

import React from 'react';

export type BadgeVariant = 'soft' | 'solid';
export type BadgeSize = 'xs' | 'sm';
export type BadgeShape = 'rounded' | 'pill';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
  className?: string;
  children: React.ReactNode;
}

function badgeClasses(
  variant: BadgeVariant,
  size: BadgeSize,
  shape: BadgeShape,
): string {
  const font = size === 'xs' ? 'text-mini font-semibold' : 'text-xs font-bold';
  const pad =
    size === 'xs'
      ? 'px-1.5 py-0.5'
      : variant === 'solid'
        ? 'px-2.5 py-1'
        : 'px-2 py-1';
  const color =
    variant === 'solid'
      ? 'bg-brand-500 text-white'
      : 'bg-brand-50 text-brand-600 dark:bg-brand-400/10';
  const radius =
    shape === 'pill'
      ? 'rounded-full'
      : variant === 'solid'
        ? 'rounded-lg'
        : 'rounded-md';
  return `${radius} ${color} ${pad} ${font}`;
}

export default function Badge({
  variant = 'soft',
  size = 'xs',
  shape = 'rounded',
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={`${badgeClasses(variant, size, shape)}${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  );
}
