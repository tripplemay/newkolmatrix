// FE-REFACTOR F003 — 协同交接卡（纯呈现，props-only）。
// 从 HandoffCollab 拆出：容器负责取数（fetch /api/handoffs → props），本组件只管渲染——
// 使 agent-canvas 预览页可用夹具 props 复用同一呈现层，消除手抄克隆与视觉回归盲区（BL-FE-02）。
// ARCH-M05 F003 升级（原型 .cl-item / .ho-*，S3-9~13）：
//   A↔B 双色 agent 名 + 可旋转 chev；展开逐轮台词（每组 3 轮）；「交接物：{payload}」chip；绿色结论行。
//   turns 缺省时保持 FE-REFACTOR 旧形态（summary + artifact），预览夹具向后兼容。

'use client';

import { useState } from 'react';
import { MdBolt, MdCheck, MdChevronRight } from 'react-icons/md';
import { BRAND_500 } from 'lib/design-tokens';

export interface HandoffTurn {
  name: string;
  /** 发言 agent 主题色（缺省 brand 紫） */
  color?: string;
  text: string;
}

export interface HandoffCardProps {
  fromName: string;
  toName: string;
  summary: string | null;
  artifactType: string | null;
  artifactRef: string | null;
  /** false = 静态展示（无展开交互、无 chevron），供确定性预览/截图 */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** ARCH-M05：双色 agent 名（S3-10） */
  fromColor?: string;
  toColor?: string;
  /** ARCH-M05：展开逐轮台词（S3-11 🔒）；提供后启用原型 .cl-item 形态 */
  turns?: HandoffTurn[];
  /** ARCH-M05：交接物 chip 文案（S3-12 🔒） */
  payload?: string | null;
  /** ARCH-M05：绿色结论行（S3-13 🔒） */
  outcome?: string | null;
}

const BRAND = BRAND_500;

function HeaderContent({
  fromName,
  toName,
  fromColor,
  toColor,
  summary,
  turnsMode,
}: {
  fromName: string;
  toName: string;
  fromColor?: string;
  toColor?: string;
  summary: string | null;
  turnsMode: boolean;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 dark:text-white">
        <span
          style={{ color: fromColor ?? undefined }}
          className={fromColor ? undefined : 'text-brand-600'}
        >
          {fromName}
        </span>
        <span className="text-gray-400">{turnsMode ? '↔' : '→'}</span>
        <span
          style={{ color: toColor ?? undefined }}
          className={toColor ? undefined : 'text-brand-600'}
        >
          {toName}
        </span>
      </span>
      {turnsMode && summary && (
        <span className="mt-0.5 block truncate text-micro text-gray-600 dark:text-gray-400">
          {summary}
        </span>
      )}
    </span>
  );
}

export default function HandoffCard({
  fromName,
  toName,
  summary,
  artifactType,
  artifactRef,
  collapsible = true,
  defaultOpen = false,
  fromColor,
  toColor,
  turns,
  payload,
  outcome,
}: HandoffCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const turnList = turns ?? [];
  const turnsMode = turnList.length > 0;
  const header = (
    <HeaderContent
      fromName={fromName}
      toName={toName}
      fromColor={fromColor}
      toColor={toColor}
      summary={summary}
      turnsMode={turnsMode}
    />
  );
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          {header}
          <MdChevronRight
            size={16}
            className={`shrink-0 text-gray-400 transition ${
              open ? 'rotate-90' : ''
            }`}
          />
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
          {header}
        </div>
      )}
      {open && (
        <div className="border-t border-gray-100 px-3 py-2 dark:border-white/5">
          {turnsMode ? (
            <>
              {/* S3-11 逐轮台词 */}
              {turnList.map((t, i) => (
                <div
                  key={i}
                  className="mb-2 border-l-2 py-0.5 pl-3"
                  style={{ borderColor: t.color ?? BRAND }}
                >
                  <b
                    className="block text-mini font-bold"
                    style={{ color: t.color ?? BRAND }}
                  >
                    {t.name}
                  </b>
                  <span className="text-micro leading-relaxed text-gray-600 dark:text-gray-300">
                    {t.text}
                  </span>
                </div>
              ))}
              {/* S3-12 交接物 chip */}
              {payload && (
                <span className="dark:bg-brand-400/10 inline-flex items-center gap-1.5 rounded-[10px] bg-brand-50 px-2.5 py-1.5 text-micro font-semibold leading-snug text-brand-600">
                  <MdBolt size={13} className="shrink-0" />
                  交接物：{payload}
                </span>
              )}
              {/* S3-13 绿色结论行 */}
              {outcome && (
                <div className="mt-2 flex items-start gap-1.5 text-micro font-bold leading-snug text-green-600 dark:text-green-400">
                  <MdCheck size={14} className="mt-px shrink-0" />
                  <span>{outcome}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {summary ?? '（无摘要）'}
              </div>
              <div className="mt-2 flex items-center gap-1 text-micro text-gray-600">
                <MdBolt size={13} className="text-brand-500" />
                交接物：{artifactType ?? '—'}（{artifactRef ?? '—'}）
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
