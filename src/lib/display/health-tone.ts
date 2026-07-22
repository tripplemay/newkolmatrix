// M1-C F005 — 健康度色调映射（D-F 收敛单点，M1-B signoff S4 兑现）。
//
// 收敛前 PILL_TONE 两份（today/page.tsx × campaigns/page.tsx，dark 变体不一致）、
// DOT_TONE 一份（ProjectDetail）。canonical 取 today 版（dark 变体最全，D-F）；
// campaigns 浅色渲染零漂移，深色略变（无深色基线，登记即可）。
// 与 HEALTH_LABEL（health-label.ts）同一取向：展示层单点，任何页面从这里 import。

import type { HealthBand } from 'lib/domain/health';

/** 原型 .pill 四色调（nu 中性 + 健康度三态 gd/wn/cr，不得压成二态） */
export const PILL_TONE: Record<'nu' | HealthBand, string> = {
  nu: 'bg-lightPrimary text-gray-600 dark:bg-white/5 dark:text-gray-400',
  gd: 'bg-green-50 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  wn: 'bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400',
  cr: 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400',
};

/** pmeta 健康度三色 dot（原型 .dot gd/wn/cr，ProjectDetail 头部） */
export const DOT_TONE: Record<HealthBand, string> = {
  gd: 'bg-green-500',
  wn: 'bg-amber-500',
  cr: 'bg-red-500',
};
