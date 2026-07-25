// M4.5-AGENT-LOOP F004 — Generative Canvas：propose_plan → 行动计划卡（柱四）
//
// 消费 propose_plan 输出（type:'action_plan'，ADR-28 结果 type 路由）。
// P7：只用既有组件语言（SurfaceCard / Badge / Button + design tokens），不引入新视觉语言。
//
// ── 卡面如实披露（P4）──
// ① 需确认的步骤逐条标「需你确认」——闸门披露前移到计划态
// ② 模型低报闸门（说不用确认但工具实为 outbound）→ 标出「模型漏标」，不替它遮掩
// ③ 工具名不在注册表 → 标出「无此工具」，不让编出来的步骤看起来像真的
// ④ 认可按钮旁常驻边界语（disclosure 来自工具产物，前端不另写一套弱化措辞）

'use client';

import React from 'react';
import { MdLockOutline, MdOutlineCheck, MdWarningAmber } from 'react-icons/md';
import Badge from 'components/common/Badge';
import Button from 'components/common/Button';
import SurfaceCard from 'components/common/SurfaceCard';
import type { ProposePlanOutput } from 'lib/agent/tools/propose-plan';

export type { ProposePlanOutput };

function ItemRow({
  index,
  item,
}: {
  index: number;
  item: ProposePlanOutput['items'][number];
}) {
  return (
    <li className="flex items-start gap-2 border-t border-gray-100 py-2 first:border-t-0 dark:border-white/10">
      <span className="mt-0.5 shrink-0 text-micro font-bold text-gray-400">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-navy-700 dark:text-white">
            {item.title}
          </span>
          {item.needsGate && (
            <Badge size="xs" shape="pill">
              <span className="inline-flex items-center gap-0.5">
                <MdLockOutline size={11} aria-hidden />
                需你确认
              </span>
            </Badge>
          )}
          {item.gateUnderreported && (
            <span className="inline-flex items-center gap-0.5 text-mini font-semibold text-red-500">
              <MdWarningAmber size={11} aria-hidden />
              模型漏标 · 已按需确认处理
            </span>
          )}
          {!item.toolKnown && (
            <span className="inline-flex items-center gap-0.5 text-mini font-semibold text-red-500">
              <MdWarningAmber size={11} aria-hidden />
              无此工具
            </span>
          )}
        </div>
        {(item.toolName || item.note) && (
          <div className="mt-0.5 truncate text-mini text-gray-600 dark:text-gray-400">
            {item.toolName ? <code>{item.toolName}</code> : null}
            {item.toolName && item.note ? ' · ' : null}
            {item.note}
          </div>
        )}
      </div>
    </li>
  );
}

export default function PlanCard({ output }: { output: ProposePlanOutput }) {
  const [acked, setAcked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ack = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/plan-ack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId: output.planId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(String(body.error ?? '认可失败，请重试'));
        return;
      }
      setAcked(true);
    } finally {
      setBusy(false);
    }
  }, [output.planId]);

  return (
    <SurfaceCard className="p-3" data-testid="action-plan-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold text-navy-700 dark:text-white">
            {output.title}
          </div>
          <div className="mt-0.5 text-mini text-gray-600 dark:text-gray-400">
            {output.items.length} 步
            {output.needsGateCount > 0
              ? ` · 其中 ${output.needsGateCount} 步需你确认`
              : ' · 无需确认的步骤'}
          </div>
        </div>
        <Badge size="sm" shape="pill" className="shrink-0">
          计划
        </Badge>
      </div>

      <ul className="mt-2">
        {output.items.map((item, i) => (
          <ItemRow key={`${i}-${item.title}`} index={i} item={item} />
        ))}
      </ul>

      {/* 边界语来自工具产物（同源，前端不另写弱化措辞） */}
      <p className="mt-2 text-mini leading-4 text-gray-600 dark:text-gray-400">
        {output.disclosure}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {acked ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-500">
            <MdOutlineCheck size={14} aria-hidden />
            已认可（仅留痕，未确认任何动作）
          </span>
        ) : (
          <Button size="sm" variant="secondary" loading={busy} onClick={ack}>
            认可这个计划
          </Button>
        )}
        {error && <span className="text-mini text-red-500">{error}</span>}
      </div>
    </SurfaceCard>
  );
}
