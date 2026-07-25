// M4.5-AGENT-LOOP F008（裁决 C）— 行动计划卡的**渐进态**：模型边写边出
//
// 数据源 = AI SDK 的 `state:'input-streaming'` partial tool input（`DeepPartial<ProposePlanInput>`）。
// 这是真的渐进：模型此刻正在逐 token 写这些字段，不是「数据已到、前端假装在写」（方案 B 被裁掉的理由）。
//
// ── 渐进态的诚实边界（Planner 追加约束）──
// **不展示模型自报的 `needsGate`。** F004 已确立闸门标注以服务端复核为准（模型低报要被标出）；
// 在服务端还没复核的阶段就把模型自称的「不需确认」画上去，等于把最不可信的那个数据当结论展示。
// 故渐进卡只出标题与步骤文字，闸门标注一律等最终产物（PlanCard）。

'use client';

import { MdEdit } from 'react-icons/md';
import Badge from 'components/common/Badge';
import SurfaceCard from 'components/common/SurfaceCard';

/** partial input 的宽松形状——流到一半的对象任何字段都可能缺，一律容忍。 */
export interface PlanDraftInput {
  title?: unknown;
  items?: unknown;
}

function draftTitle(input: PlanDraftInput): string | null {
  return typeof input.title === 'string' && input.title.trim()
    ? input.title
    : null;
}

/** 只取已经写出来的步骤标题；未成形的条目跳过（不渲染空行占位）。 */
function draftItemTitles(input: PlanDraftInput): string[] {
  if (!Array.isArray(input.items)) return [];
  return input.items
    .map((it) => (it as { title?: unknown } | null)?.title)
    .filter((t): t is string => typeof t === 'string' && t.trim() !== '');
}

export default function PlanCardDraft({ input }: { input: PlanDraftInput }) {
  const title = draftTitle(input);
  const items = draftItemTitles(input);
  // 一个字都还没写出来 → 不出空壳卡（空壳会先闪一下再被填满，正是要避免的闪烁）
  if (!title && items.length === 0) return null;

  return (
    <SurfaceCard className="p-3" data-testid="action-plan-card-draft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold text-navy-700 dark:text-white">
            {title ?? '（正在拟定标题…）'}
          </div>
          <div className="mt-0.5 text-mini text-gray-600 dark:text-gray-400">
            已写出 {items.length} 步 · 还在拟定中
          </div>
        </div>
        <Badge size="sm" shape="pill" className="shrink-0">
          <span className="inline-flex items-center gap-0.5">
            <MdEdit size={11} aria-hidden />
            拟定中
          </span>
        </Badge>
      </div>

      <ul className="mt-2">
        {items.map((t, i) => (
          <li
            key={`${i}-${t}`}
            className="flex items-start gap-2 border-t border-gray-100 py-2 first:border-t-0 dark:border-white/10"
          >
            <span className="mt-0.5 shrink-0 text-micro font-bold text-gray-400">
              {i + 1}
            </span>
            <span className="text-xs font-semibold text-navy-700 dark:text-white">
              {t}
            </span>
          </li>
        ))}
      </ul>

      {/* 渐进态不出闸门标注：服务端还没复核，模型自报的不作数 */}
      <p className="mt-2 text-mini leading-4 text-gray-600 dark:text-gray-400">
        计划还在拟定中。每一步是否需要你确认，要等服务端按工具注册表复核后才会标出——
        这里不显示模型自己的说法。
      </p>
    </SurfaceCard>
  );
}
