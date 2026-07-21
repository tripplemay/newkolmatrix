// ARCH-M05 F013 — 创作者库域共用小件：avatar 色轮 + pill 色调（V9 表格与 V10 抽屉共用）。
// 对照原型：AVC 6 色轮（L559）+ `avatar()`（L672，首二字 · 圆形 · 0.34 字号比）+
// `.pill` 5 色调（L93-96：ac 淡紫 / gd 绿 / wn 琥珀 / nu 中性 / cr 红）。

import React from 'react';
// 原型 AVC 色轮（brand 紫 / 绿 / 琥珀 / 蓝 / 红 / 浅紫）——单一出处见 lib/design-tokens
import { AVATAR_WHEEL } from 'lib/design-tokens';

export function CreatorAvatar({
  name,
  index,
  size = 38,
}: {
  name: string;
  /** 全量列表中的行序（决定色轮取色，筛选后不漂移） */
  index: number;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: AVATAR_WHEEL[index % AVATAR_WHEEL.length],
      }}
    >
      {name.slice(0, 2)}
    </span>
  );
}

export type PillTone = 'ac' | 'gd' | 'wn' | 'nu' | 'cr';

/** 原型 .pill 色调 → 项目 token（wn 文字用 horizonOrange-700 #C27400，对照原型浅色态） */
const PILL_TONE_CLASSES: Record<PillTone, string> = {
  ac: 'bg-brand-50 text-brand-500 dark:bg-navy-700 dark:text-brand-300',
  gd: 'bg-horizonGreen-50 text-horizonGreen-500 dark:bg-horizonGreen-900 dark:text-horizonGreen-400',
  wn: 'bg-horizonOrange-50 text-horizonOrange-700 dark:bg-horizonOrange-900 dark:text-horizonOrange-500',
  nu: 'bg-lightPrimary text-gray-700 dark:bg-navy-700 dark:text-gray-400',
  cr: 'bg-horizonRed-50 text-horizonRed-500 dark:bg-horizonRed-900 dark:text-horizonRed-400',
};

export function Pill({
  tone = 'nu',
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-[5px] text-micro font-bold ${
        PILL_TONE_CLASSES[tone]
      }${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  );
}

/** 可信度 → pill 三态（A 级 gd / B 级 nu / C 级 wn，V9 列 6） */
export function credTone(cred: 'A' | 'B' | 'C'): PillTone {
  return cred === 'A' ? 'gd' : cred === 'B' ? 'nu' : 'wn';
}
