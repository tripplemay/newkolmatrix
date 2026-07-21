// ARCH-M05 F012 — Insight 环节「对照账本」语法面（ui-inventory V8）mock 数据。
// D2 渲染契约：组件经 lib/data/provenance.readContractSlot 读取本文件 raw 导出，
// 校验失败/缺失 → null → 占位渲染（绝不抛错/填 0）。数值与文案逐字对照原型
// docs/product/interaction-prototype-v2.html：RECON L595-598 / GAPS L599 /
// CHANNELS L600 / AUDIENCE L601 / 复盘草案 L815-817 / 采纳 toast L1002 /
// 分享闸门 L1003（scope=project，harm 数据范围行按裁决 #3 调整）。

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * 对照表（V8：4 列 ×4 行，指标/原目标/实际/差异——三值三样式不得统一）
 * ------------------------------------------------------------------ */

export const reconRowSchema = z.object({
  metric: z.string(),
  /** 原目标（灰 muted） */
  target: z.string(),
  /** 实际（navy-700 · fw700） */
  actual: z.string(),
  /** 差异（fw800，up 绿 / down 红） */
  delta: z.string(),
  /** true = 达成方向正向（绿），false = 未达（红）——「7 日留存」唯一 down 行 */
  up: z.boolean(),
});
export const reconListSchema = z.array(reconRowSchema).length(4);
export type ReconRow = z.infer<typeof reconRowSchema>;

export const mockReconRows: unknown = [
  { metric: '有效安装', target: '5,000', actual: '5,420', delta: '+8%', up: true },
  { metric: '休闲玩家占比', target: '65%', actual: '71%', delta: '+6pt', up: true },
  { metric: '单次安装成本', target: '$1.5', actual: '$1.4', delta: '-7%', up: true },
  { metric: '7 日留存', target: '32%', actual: '26%', delta: '-6pt', up: false },
];

/* ------------------------------------------------------------------ *
 * 证据缺口卡（V8：eyebrow「证据缺口 3」+ 🔒 gaprow ×3 诚实归因边界，逐字）
 * ------------------------------------------------------------------ */

export const gapListSchema = z.array(z.string()).length(3);

export const mockGaps: unknown = [
  '北美安卓渠道缺归因回传，低留存暂不能直接归因于创作者',
  '自然安装与投流安装尚未拆分',
  '部分创作者未上报真实播放来源',
];

/* ------------------------------------------------------------------ *
 * 渠道 chartcard（V8：sub/big/badge + BarChart 5 柱，hi=YouTube）
 * ------------------------------------------------------------------ */

export const channelBarSchema = z.object({
  label: z.string(),
  value: z.number(),
  /** 主推柱（原型 hi：brand 垂直渐变，其余 brand-50 淡紫） */
  hi: z.boolean(),
});
export type ChannelBar = z.infer<typeof channelBarSchema>;

export const channelChartSchema = z.object({
  sub: z.string(),
  big: z.string(),
  /** 绿 badge 文案（trend 图标由页面渲染） */
  badge: z.string(),
  bars: z.array(channelBarSchema).length(5),
});
export type ChannelChart = z.infer<typeof channelChartSchema>;

export const mockChannelChart: unknown = {
  sub: '各渠道有效安装占比',
  big: '5,420',
  badge: '达标',
  bars: [
    { label: 'YouTube', value: 38, hi: true },
    { label: 'TikTok', value: 29, hi: false },
    { label: 'Twitch', value: 18, hi: false },
    { label: 'IG', value: 9, hi: false },
    { label: '其他', value: 6, hi: false },
  ],
};

/* ------------------------------------------------------------------ *
 * 受众构成（V8：donut 150 四段 + 🔒 中心叠加读数 + legend 4 行）
 *
 * tone 存 token 名而非裸 hex，由组件映射图色与 legend 色块类
 * （原型 AUDIENCE 色轮：#422afb→brand / #01b574→green / #ffb547→orange / #3965ff→blue）。
 * ------------------------------------------------------------------ */

export const audienceToneSchema = z.enum(['brand', 'green', 'orange', 'blue']);
export type AudienceTone = z.infer<typeof audienceToneSchema>;

export const audienceSegmentSchema = z.object({
  tone: audienceToneSchema,
  pct: z.number(),
  label: z.string(),
});
export type AudienceSegment = z.infer<typeof audienceSegmentSchema>;

export const audienceSchema = z.object({
  /** 🔒 中心叠加读数（绝对定位覆盖层，不得删）：主读数 + 副标签 */
  center: z.object({ value: z.string(), label: z.string() }),
  segments: z.array(audienceSegmentSchema).length(4),
});
export type Audience = z.infer<typeof audienceSchema>;

export const mockAudience: unknown = {
  center: { value: '71%', label: '休闲玩家' },
  segments: [
    { tone: 'brand', pct: 44, label: '休闲农场向' },
    { tone: 'green', pct: 27, label: '生活方式' },
    { tone: 'orange', pct: 18, label: '亲子家庭' },
    { tone: 'blue', pct: 11, label: '其他' },
  ],
};

/* ------------------------------------------------------------------ *
 * retro 复盘草案卡（V8：渐变淡紫 dlbl + 正文含归因限制 + 采纳 internal）
 * ------------------------------------------------------------------ */

export const retroSchema = z.object({
  label: z.string(),
  body: z.string(),
  /** internal 无弹窗：采纳直接 Toast（文案逐字原型 [data-adopt] 处理器 L1002） */
  adoptToast: z.string(),
});
export type Retro = z.infer<typeof retroSchema>;

export const mockRetro: unknown = {
  label: 'Agent 复盘草案 · 采纳后可复用到下个项目',
  body: '休闲农场向创作者贡献了 71% 的有效安装，单次安装成本比投流低 28%，可作为下季度默认组合。北美安卓渠道因缺归因回传，暂不能把低留存归因于创作者，建议下次前置埋点。',
  adoptToast: '复盘结论已采纳，加入下季度默认组合',
};

/* ------------------------------------------------------------------ *
 * 🚪 对外分享闸门（scope=project，裁决 #3）
 *
 * 与跨项目洞察页（/admin/insight，F015，scope='quarterly'，数据范围
 * 「季度汇总指标 · 不含联系方式」）区分：同一 create_share_link 工具、
 * UI 传不同 scope，harm 行如实披露各自数据范围（闸门如实披露原则，ADR-08）。
 * 本环节 = 项目内汇总，故数据范围行为「本项目汇总指标 · 不含联系方式」。
 * ------------------------------------------------------------------ */

export const envShareGateSchema = z.object({
  scope: z.literal('project'),
  title: z.string(),
  body: z.string(),
  /** 🔒 harm 利害清单：分享类固定 2 行（数据范围 / 有效期，spec S4 行数矩阵 2/3/3/2） */
  harmRows: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .length(2),
  /** 🔒 不可逆红标行 */
  irrev: z.string(),
  confirmText: z.string(),
  /** 确认后的 mock 反馈（D6 stub：真实 create_share_link 归 M4），逐字原型 onok L1003 */
  successToast: z.string(),
});
export type EnvShareGate = z.infer<typeof envShareGateSchema>;

export const mockEnvShareGate: unknown = {
  scope: 'project',
  title: '确认对外分享',
  body: '生成对外分享链接，将暴露项目数据。',
  harmRows: [
    { label: '数据范围', value: '本项目汇总指标 · 不含联系方式' },
    { label: '有效期', value: '14 天' },
  ],
  irrev: '对外 · 链接生成后数据可能被转发',
  confirmText: '生成链接',
  successToast: '已生成分享链接，14 天后失效',
};
