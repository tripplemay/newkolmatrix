// ARCH-M05 F017 — JS 域设计 token 单一出处（token-scan 豁免源，见 fe-audit-token-scan.mjs EXEMPTIONS）。
//
// Tailwind className 覆盖不到的场景（ApexCharts options、inline style、canvas、SVG 属性）
// 必须消费具体色值——这些值只允许在本文件定义（逐一对照 design-draft/horizon-tokens.md
// 与原型 CSS），组件一律 import，不得在 JS 里散落字面量（FE-AUDIT F003 判据的 M0.5 延伸）。

/** horizon-tokens §1 — 品牌主色 brand-500（运行时可被 --color-500 覆盖，JS 静态场景用本值兜底） */
export const BRAND_500 = '#422AFB';

export const WHITE = '#FFFFFF';

/** horizon-tokens §3 — 次要文本 gray-600（图表 dataLabel/legend 用） */
export const GRAY_600 = '#A3AED0';

/** 模板 charts/CircularProgress trailColor 同值（F005 HalfGauge 沿用） */
export const GAUGE_TRACK = '#E9EDF7';

// 说明：navbar 玻璃底、淡紫渐变对、闸门遮罩**不在本文件**——它们出现在 className
// （Tailwind arbitrary value / 既有 utility），属 CSS 域，token 出处是 tailwind.config.js：
//   #0b14374d              → theme.colors.navyGlass（navbar dark:bg-navyGlass）
//   rgba(117,81,255,0.08)  → theme.colors.brandSoft.a（from-brandSoft-a）
//   rgba(66,42,251,0.06/.1)→ theme.colors.brandSoft.b / .c
//   rgba(11,20,55,.5)      → 已由既有 utility !bg-navy-900/50 表达（GateConfirm）
// 理由：Tailwind JIT 静态扫描源码文本，`from-[${JS常量}]` 不会生成任何 CSS（渐变会静默消失），
// 因此 className 可达的值必须走 Tailwind 配置，不得改由 JS 常量供给。

/** 原型 AVC 6 色轮（L559）——项目/创作者 avatar 与图表分组色共用 */
export const AVATAR_WHEEL = [
  BRAND_500,
  '#01B574',
  '#FFB547',
  '#3965FF',
  '#EE5D50',
  '#7551FF',
] as const;

/** 图表语义色（= 色轮成员的具名别名，Apex options 用） */
export const CHART_GREEN = AVATAR_WHEEL[1];
export const CHART_AMBER = AVATAR_WHEEL[2];
export const CHART_BLUE = AVATAR_WHEEL[3];
export const CHART_RED = AVATAR_WHEEL[4];
export const CHART_VIOLET = AVATAR_WHEEL[5];
