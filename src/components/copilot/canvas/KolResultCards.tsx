// AGENT-FOUNDATION F007 — Generative Canvas：search_kols → KOL 卡片流（柱四）
//
// 消费 F005 search_kols 工具输出，渲染真实 seed KOL 卡片流。忠实 Horizon 卡片视觉（brand 强调）。

'use client';

import { MdVerified, MdOpenInNew } from 'react-icons/md';
import Badge from 'components/common/Badge';
import SurfaceCard from 'components/common/SurfaceCard';

export interface KolHit {
  id: string;
  publicId: string;
  displayName: string | null;
  platform: string | null;
  handle: string | null;
  profileUrl: string | null;
  country: string | null;
  followers: number | null;
  categories: string[];
  similarity: number;
}

export interface SearchKolsOutput {
  query: string;
  count: number;
  kols: KolHit[];
}

function fmtFollowers(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function KolCard({ kol }: { kol: KolHit }) {
  const pct = Math.round(kol.similarity * 100);
  return (
    <SurfaceCard interactive className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-navy-700 dark:text-white">
            <span className="truncate">
              {kol.displayName ?? kol.handle ?? '(无名)'}
            </span>
            <MdVerified className="shrink-0 text-brand-500" size={14} />
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {kol.platform ?? '—'} · {kol.country ?? '—'} ·{' '}
            {fmtFollowers(kol.followers)} 粉丝
          </div>
        </div>
        {/* 匹配度半环替代：数值徽标（generative canvas 最小实现，EXTENSION POINT：→ 半环仪表） */}
        <Badge size="sm" shape="pill" className="shrink-0">
          {pct}% 匹配
        </Badge>
      </div>
      {kol.categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {kol.categories.slice(0, 4).map((c) => (
            <span
              key={c}
              className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {kol.profileUrl && (
        <a
          href={kol.profileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
        >
          频道 <MdOpenInNew size={12} />
        </a>
      )}
    </SurfaceCard>
  );
}

export default function KolResultCards({
  output,
}: {
  output: SearchKolsOutput;
}) {
  if (!output.kols || output.kols.length === 0) {
    return (
      <div className="text-xs text-gray-500">
        「{output.query}」没有找到相关 KOL。
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {output.count} 位候选 · 「{output.query}」
      </div>
      {output.kols.map((k) => (
        <KolCard key={k.id} kol={k} />
      ))}
    </div>
  );
}
