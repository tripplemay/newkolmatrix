// ARCH-M05 F004 — 溯源徽标（D15 差异化核心「每个数字都知道从哪来」；裁决 #10 双 variant）。
// resolveProvenance 的唯一渲染出口（FR-11.7）：
//   variant='badge'  抽屉分区头胶囊态（V10 ×5，如「Apify 采集 · 3 天前 · 可信度 高」），可展开明细
//   variant='inline' 知识页溯源行内联小字（V11，如「策略 Agent 基于 4 份素材分析（…）」）
// 来源区分走图标+文字双通道（色盲友好，不只靠颜色）；展开明细说明溯源层级（FR-8.3.11）。

'use client';

import { useState } from 'react';
import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdHowToReg,
  MdReceiptLong,
  MdTravelExplore,
  MdUploadFile,
  MdVerified,
} from 'react-icons/md';
import type { DataSource, ResolvedProvenance } from 'lib/data/provenance';

/** 来源 → 图标+文字（双通道，六档全覆盖；顺序即可信度从高到低，§7.5） */
export const SOURCE_META: Record<DataSource, { label: string; Icon: IconType }> =
  {
    platform_api: { label: '平台 API', Icon: MdVerified },
    optin: { label: '主动入驻', Icon: MdHowToReg },
    purchased: { label: '外购评估', Icon: MdReceiptLong },
    crawl: { label: 'Apify 采集', Icon: MdTravelExplore },
    user_upload: { label: '你上传', Icon: MdUploadFile },
    ai_estimate: { label: 'AI 估算·未验证', Icon: MdAutoAwesome },
  };

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const RESOLVED_FROM_LABEL: Record<ResolvedProvenance['resolvedFrom'], string> = {
  field: '字段级溯源（fieldProvenance 覆盖）',
  row: '实体级默认（dataSource）',
  fallback: '保守下限（无溯源记录，按 AI 估算·未验证处理）',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** fetchedAt 兼作新鲜度（FR-11.8）：ISO 时间 → 「今天 / N 天前」；非时间字符串原样显示 */
function formatFetchedAt(fetchedAt: string): string {
  const ts = Date.parse(fetchedAt);
  if (Number.isNaN(ts)) return fetchedAt;
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if (days <= 0) return '今天';
  return `${days} 天前`;
}

/** 无覆盖文案时按溯源自动拼装：来源 · 新鲜度 · 可信度 */
function buildText(p: ResolvedProvenance): string {
  const parts = [SOURCE_META[p.source].label];
  if (p.fetchedAt) parts.push(formatFetchedAt(p.fetchedAt));
  if (p.confidence) parts.push(`可信度 ${CONFIDENCE_LABEL[p.confidence]}`);
  return parts.join(' · ');
}

export interface ProvenanceTagProps {
  /** 唯一数据源 = resolveProvenance 的返回值（FR-11.7） */
  provenance: ResolvedProvenance;
  variant?: 'badge' | 'inline';
  /** 覆盖显示文案（原型 V10 五处为定制文案，如「CRM · 历史成交」）；不传则按 provenance 自动拼装 */
  label?: string;
  /** badge 态可展开明细（默认 true）；确定性截图/静态场景可关 */
  expandable?: boolean;
  className?: string;
}

function DetailPanel({ provenance }: { provenance: ResolvedProvenance }) {
  const rows: Array<[string, string]> = [
    ['溯源层级', RESOLVED_FROM_LABEL[provenance.resolvedFrom]],
    ['来源', SOURCE_META[provenance.source].label],
    ['抓取时间', provenance.fetchedAt ?? '未知'],
    [
      '可信度',
      provenance.confidence
        ? CONFIDENCE_LABEL[provenance.confidence]
        : '未标注',
    ],
  ];
  if (provenance.detail) rows.push(['备注', provenance.detail]);
  return (
    <div className="absolute right-0 top-full z-10 mt-1.5 w-56 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl shadow-shadow-500 dark:border-white/10 dark:bg-navy-700 dark:shadow-none">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2 py-0.5 text-micro">
          <span className="shrink-0 font-semibold text-gray-400">{k}</span>
          <span className="text-gray-700 dark:text-gray-200">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProvenanceTag({
  provenance,
  variant = 'badge',
  label,
  expandable = true,
  className,
}: ProvenanceTagProps) {
  const [open, setOpen] = useState(false);
  const { Icon } = SOURCE_META[provenance.source];
  const text = label ?? buildText(provenance);
  const iconTone =
    provenance.source === 'ai_estimate'
      ? 'text-amber-500 dark:text-amber-400'
      : 'text-green-500 dark:text-green-400';

  if (variant === 'inline') {
    return (
      <span
        title={RESOLVED_FROM_LABEL[provenance.resolvedFrom]}
        className={`inline-flex items-center gap-1 text-micro text-gray-600 dark:text-gray-400${className ? ` ${className}` : ''}`}
      >
        <Icon size={12} aria-hidden className={`shrink-0 ${iconTone}`} />
        {text}
      </span>
    );
  }

  const pill = (
    <>
      <Icon size={12} aria-hidden className={`shrink-0 ${iconTone}`} />
      {text}
    </>
  );
  const pillClass =
    'inline-flex items-center gap-1 rounded-full bg-lightPrimary px-2 py-1 text-mini font-semibold text-gray-600 dark:bg-navy-700 dark:text-gray-400';

  if (!expandable) {
    return (
      <span className={`${pillClass}${className ? ` ${className}` : ''}`}>
        {pill}
      </span>
    );
  }
  return (
    <span className={`relative inline-flex${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`溯源：${text}，点击${open ? '收起' : '展开'}明细`}
        onClick={() => setOpen((v) => !v)}
        className={pillClass}
      >
        {pill}
      </button>
      {open && <DetailPanel provenance={provenance} />}
    </span>
  );
}
