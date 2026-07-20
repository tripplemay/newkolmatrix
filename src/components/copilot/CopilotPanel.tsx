// AGENT-FOUNDATION F007 — 常驻对话面（柱三）：多 Agent 对话驱动面
//
// Horizon 外壳右栏常驻 Copilot 面板，useChat 接 /api/agent（F005 流式 loop）。
// - 顶部常驻专家 Agent 头（duty + 否定式护栏，ExpertScope）
// - 消息气泡（还原设计稿 .cmsg：user 渐变右 / agent 浅色左）
// - generative canvas：工具结果经 canvas-registry 渲染（search_kols → KOL 卡片流）
// - 协同交接可视化（HandoffCollab）
// - 多人格切换：进不同 route 自动切人格；context key 变化 → 对话清空 + 新专家开场白（FR-12.4）

'use client';

import { Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MdSend } from 'react-icons/md';
import {
  buildContextKey,
  defaultAgentForRoute,
  type CopilotContext,
} from 'lib/agent/persona-router';
import { personaBoundary, DEFAULT_AGENT_ID } from 'lib/agent/registry';
import { STAGE_AGENT, isStage } from 'lib/agent/stage-routing';
import ExpertScope from './ExpertScope';
import HandoffCollab from './HandoffCollab';
import { hasCanvasRenderer, renderToolResult } from './canvas/canvas-registry';

function deriveContext(
  pathname: string,
  stageParam: string | null,
): CopilotContext {
  const route = pathname || '/admin';
  // 项目详情 /admin/campaigns/[id]：projectId 从路径解析；?stage= 指定环节 → 切该环节专家（F008 五环节唯一容器）。
  const projMatch = route.match(/^\/admin\/campaigns\/([^/]+)$/);
  if (projMatch && projMatch[1] !== undefined) {
    const projectId = projMatch[1];
    const agentId =
      stageParam && isStage(stageParam)
        ? STAGE_AGENT[stageParam]
        : DEFAULT_AGENT_ID;
    return { route, projectId, env: 'default', agentId };
  }
  return {
    route,
    projectId: null,
    env: 'default',
    agentId: defaultAgentForRoute(route),
  };
}

/** 单条消息渲染：文本气泡 + 工具结果画布。 */
function MessageParts({
  message,
}: {
  message: { role: string; parts: unknown[] };
}) {
  const isUser = message.role === 'user';
  return (
    <>
      {message.parts.map((raw, i) => {
        const part = raw as {
          type: string;
          text?: string;
          toolName?: string;
          state?: string;
          output?: unknown;
        };
        if (part.type === 'text' && part.text) {
          return (
            <div
              key={i}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={
                  isUser
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand-400 to-brand-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white'
                    : 'max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white'
                }
              >
                {part.text}
              </div>
            </div>
          );
        }
        // 工具 part：静态工具 type=`tool-<name>`（传给 streamText 的工具），动态工具 type='dynamic-tool'。
        const isTool =
          part.type === 'dynamic-tool' || part.type.startsWith('tool-');
        if (isTool) {
          const toolName =
            part.type === 'dynamic-tool'
              ? part.toolName ?? ''
              : part.type.slice('tool-'.length);
          if (
            part.state === 'output-available' &&
            hasCanvasRenderer(toolName)
          ) {
            return <div key={i}>{renderToolResult(toolName, part.output)}</div>;
          }
          const label =
            part.state === 'output-error'
              ? `工具 ${toolName} 出错`
              : `调用工具 ${toolName}…`;
          return (
            <div key={i} className="text-[11px] italic text-gray-400">
              {label}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function CopilotChat({ context }: { context: CopilotContext }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent',
      body: { context },
    }),
  });

  const persona = personaBoundary(context.agentId);
  const busy = status === 'submitted' || status === 'streaming';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：专家 Agent 头（职责 + 否定式护栏，常驻） */}
      <div className="shrink-0 p-3">
        <ExpertScope agentId={context.agentId} />
      </div>

      {/* 消息流 + 画布 */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-2 dark:bg-navy-900">
        {messages.length === 0 && persona && (
          // 新专家开场白（context key 变化后 remount → 空消息 → 开场）
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white">
              我是{persona.name}，负责{persona.duty}。有什么可以帮你的？
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageParts
            key={m.id}
            message={m as unknown as { role: string; parts: unknown[] }}
          />
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] text-gray-400 shadow-sm dark:bg-navy-700">
              {persona?.name ?? '专家'}正在思考…
            </div>
          </div>
        )}
        <HandoffCollab />
      </div>

      {/* 指令输入 */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-gray-200 p-3 dark:border-white/10"
      >
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-navy-700">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`对${persona?.name ?? '专家'}说…`}
            className="bg-transparent min-w-0 flex-1 text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition disabled:opacity-40"
            aria-label="发送"
          >
            <MdSend size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

// 用 useSearchParams 读 ?stage=（项目详情切环节专家）——须 Suspense 包裹（Next 15）。
function CopilotPanelInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = deriveContext(
    pathname ?? '/admin',
    searchParams.get('stage'),
  );
  const contextKey = buildContextKey(context);
  // key=contextKey（含 agentId，随 route/env/stage-专家 变化）→ 整个 chat remount（对话清空 + 新专家开场白，FR-12.4）
  return <CopilotChat key={contextKey} context={context} />;
}

export default function CopilotPanel() {
  return (
    <aside className="fixed right-0 top-0 z-40 hidden h-screen w-[360px] flex-col border-l border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800 xl:flex">
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div className="text-sm font-bold text-navy-700 dark:text-white">
          Copilot · 多 Agent 编队
        </div>
        <div className="text-[11px] text-gray-400">
          进不同环节自动切换对应专家
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="p-4 text-sm text-gray-400">加载 Copilot…</div>
          }
        >
          <CopilotPanelInner />
        </Suspense>
      </div>
    </aside>
  );
}
