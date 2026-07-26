// M4.7-FRONTDESK F008 — 咨询痕迹（一行可展开）
//
// 【它替代了什么】M4.5 的 handoff_to 形态下，换专家 = 面板顶部身份卡换人，用户
// 看着界面"抽搐"。单一前台之后**身份恒为前台**，专家隐入内部——但不能变成黑箱：
// 用户仍该看得见"这个结论是谁给的、他读了什么"。故渲染成一行痕迹，点开看细节。
//
// 【为什么不新开一条流事件】咨询的调用与产物本来就在 UI 流里（tool-consult_specialist
// 的 part），走既有 canvas 路由键 `type:'consultation'` 即可——不新增通道，
// 少一处可漂移的地方。
//
// 安全红线（FR-12.16）：只渲染受控组件树，模型文本一律作数据 props，禁 innerHTML。

'use client';

import { useState } from 'react';
import { getPersona } from 'lib/agent/registry';

export interface ConsultationOutput {
  type: 'consultation';
  ok: boolean;
  /** 前台问出去的原话——痕迹要说清「问了什么」 */
  question?: string;
  failureReason?: string;
  agentId: string;
  answer: string;
  toolNames: string[];
  steps: number;
  budgetHit: boolean;
  insufficientEvidence: boolean;
  insufficientReasons: string[];
}

/**
 * 专家展示名与职责**与 registry 同源**（M4.7 fix_round1 / F008）。
 *
 * 【为什么不硬编码】首轮验收指出本组件自带一份 AGENT_LABEL 映射——registry 改了
 * 名字这里不会跟着变，是典型的双份说法。仓内一贯纪律：人格文案单一真相源在
 * registry，前端不硬编码（同 personaBoundary 的用法）。
 */
function agentLabel(agentId: string): string {
  try {
    return getPersona(agentId as never).name;
  } catch {
    return agentId; // 未知 id 就照实显示，不编一个好看的名字
  }
}

export default function ConsultationNote({
  output,
}: {
  output: ConsultationOutput;
}) {
  const [open, setOpen] = useState(false);
  const who = agentLabel(output.agentId);

  return (
    <div className="my-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-gray-600 dark:text-white/70"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        <span>
          咨询了<strong className="mx-1">{who}</strong>
          {output.ok
            ? output.toolNames.length > 0
              ? `· 读了 ${output.toolNames.length} 项数据`
              : '· 未调用工具'
            : '· 未拿到结果'}
        </span>
        {/* 三类"不完整"必须在**收起态**就看得见——展开才说等于没说 */}
        {!output.ok && (
          <span className="ml-auto rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">
            咨询失败
          </span>
        )}
        {output.ok && output.insufficientEvidence && (
          <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            证据不足
          </span>
        )}
        {output.ok && !output.insufficientEvidence && output.budgetHit && (
          <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            未答完
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1 border-t border-gray-200 pt-2 text-xs text-gray-600 dark:border-white/10 dark:text-white/60">
          {!output.ok && (
            <p>
              没拿到结果：{output.failureReason ?? '未知原因'}
            </p>
          )}
          {output.question && <p>问的是：{output.question}</p>}
          {output.toolNames.length > 0 && (
            <p>读取：{output.toolNames.join('、')}</p>
          )}
          <p>步数：{output.steps}</p>
          {output.insufficientEvidence && (
            <p>
              证据缺口：
              {output.insufficientReasons.length > 0
                ? output.insufficientReasons.join('；')
                : '专家未说明'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
