// AGENT-FOUNDATION F007 — 常驻对话面（柱三）：多 Agent 对话驱动面
//
// Horizon 外壳右栏常驻 Copilot 面板，useChat 接 /api/agent（F005 流式 loop）。
// - 消息气泡（还原设计稿 .cmsg：user 渐变右 / agent 浅色左）
// - generative canvas：工具结果经 canvas-registry 渲染（search_kols → KOL 卡片流）
// - 多人格切换：进不同 route 自动切人格；context key 变化 → 对话清空 + 新专家开场白（FR-12.4）
//
// ARCH-M05 F003 升级（原型 S3 19 元素）：
// - cop-head 渐变随专家主题色（agent-theme 本地色表）+ dm 图标块 + 动态专家名/副标题
// - cop-auto 边界条（🔒 D26/D27 宣示）· 职责/隔离卡（ExpertScope）或编队紧凑名册（AgentSquad compact，仅编排上下文）
// - 「{专家}刚刚完成」卡 · 协同卡升级（HandoffCollab，逐轮台词 mock）· 动作卡（enter:/pick:/env:）
// - 建议 chips（每上下文 3 条）· 渐变圆发送钮（Button primary iconOnly）
// - 移动端退为 fixed 右滑抽屉（navbar cop-toggle / 指令栏 Enter 经 CopilotUiContext 控制）

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MdCheck, MdSend, MdShield } from 'react-icons/md';
import {
  buildContextKey,
  defaultAgentForRoute,
  type CopilotContext,
} from 'lib/agent/persona-router';
import { personaBoundary, DEFAULT_AGENT_ID } from 'lib/agent/registry';
import { agentTheme } from 'lib/agent/agent-theme';
import { STAGE_AGENT, isStage } from 'lib/agent/stage-routing';
import { useCopilotUi } from 'contexts/CopilotUiContext';
import Button from 'components/common/Button';
import ChatBubble from 'components/common/ChatBubble';
import AgentSquad, { AGENT_ICONS } from 'components/common/AgentSquad';
import ExpertScope from './ExpertScope';
import HandoffCollab from './HandoffCollab';
import ActionCard from './ActionCard';
import { mockCopilotUi } from './mock';
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
            <ChatBubble key={i} role={isUser ? 'user' : 'agent'}>
              {part.text}
            </ChatBubble>
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
            <div key={i} className="text-micro italic text-gray-400">
              {label}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

/** S3-8 🔒 「{专家}刚刚完成」卡（原型 .cop-did，ARCH-M05 mock 数据） */
function RecentlyDone({ name, items }: { name: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl bg-lightPrimary px-4 py-3.5 dark:bg-navy-700">
      <div className="mb-2 text-mini font-bold uppercase tracking-wide text-gray-400">
        {name} 刚刚完成
      </div>
      {items.map((d, i) => (
        <div
          key={i}
          className="flex items-start gap-2 py-1 text-compact text-navy-700 dark:text-white"
        >
          <MdCheck size={14} className="mt-0.5 shrink-0 text-green-600" />
          <span>{d}</span>
        </div>
      ))}
    </div>
  );
}

function CopilotChat({
  context,
  stage,
}: {
  context: CopilotContext;
  stage: string | null;
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent',
      body: { context },
    }),
  });
  const { command, consumeCommand } = useCopilotUi();
  const consumedRef = useRef(0);

  const persona = personaBoundary(context.agentId);
  const theme = agentTheme(context.agentId);
  const HeadIcon = AGENT_ICONS[context.agentId];
  const ui = mockCopilotUi(context.route, stage, context.projectId);
  const busy = status === 'submitted' || status === 'streaming';

  // S2 交互：navbar 指令栏 Enter → 内容送 Copilot（经 CopilotUiContext 桥接）
  useEffect(() => {
    if (!command || command.id === consumedRef.current) return;
    consumedRef.current = command.id;
    sendMessage({ text: command.text });
    consumeCommand(command.id);
  }, [command, sendMessage, consumeCommand]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
    setInput('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* S3-1~4 cop-head：渐变随专家主题色 + dm 图标块 42 + 专家名 + 副标题 */}
      <div
        className="flex shrink-0 items-center gap-3 p-5 text-white"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${theme.color} 55%, #ffffff), ${theme.color})`,
        }}
      >
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-white/20">
          <HeadIcon size={20} />
        </span>
        <div className="min-w-0">
          <b className="block text-[15px] font-bold">
            {persona?.name ?? 'Agent'}
          </b>
          <small className="block truncate text-micro text-white/85">
            {ui.sub}
          </small>
        </div>
      </div>

      {/* S3-5 🔒 cop-auto 边界条（D26/D27 常驻宣示，文案逐字原型） */}
      <div className="flex shrink-0 items-start gap-2 border-b border-gray-200 bg-lightPrimary px-4 py-3 text-micro leading-relaxed text-gray-600 dark:border-white/10 dark:bg-navy-900 dark:text-gray-400">
        <MdShield size={14} className="mt-0.5 shrink-0 text-brand-500" />
        <span>
          <b className="text-navy-700 dark:text-white">只做可撤销的事。</b>
          对外与花钱的动作会先停在你面前，并列清利害。
        </span>
      </div>

      {/* 消息流 + 画布 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-gray-50 p-4 dark:bg-navy-900">
        {/* S3-6 🔒 职责/隔离卡 或 S3-7 🔒 编队紧凑名册（仅编排上下文） */}
        {ui.squad ? (
          <AgentSquad variant="compact" />
        ) : (
          <ExpertScope agentId={context.agentId} />
        )}
        <RecentlyDone name={persona?.name ?? 'Agent'} items={ui.did} />
        {/* S3-9~13 🔒 协同卡（虚线框 + 逐轮台词 + 交接物 chip + 绿色结论行） */}
        <HandoffCollab stage={context.projectId ? stage : null} />
        {messages.length === 0 && (
          // 新专家开场白（context key 变化后 remount → 空消息 → 开场）+ 开场动作卡
          <>
            <ChatBubble role="agent">{ui.greeting}</ChatBubble>
            {ui.actions.map((a) => (
              <ActionCard key={a.go} action={a} />
            ))}
          </>
        )}
        {messages.map((m) => (
          <MessageParts
            key={m.id}
            message={m as unknown as { role: string; parts: unknown[] }}
          />
        ))}
        {busy && (
          <ChatBubble role="agent" muted>
            {persona?.name ?? '专家'}正在思考…
          </ChatBubble>
        )}
      </div>

      {/* S3-17 建议 chips（每上下文 3 条） */}
      {ui.prompts.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-gray-200 px-4 py-3 dark:border-white/10">
          {ui.prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-500 hover:text-brand-500 dark:border-white/10 dark:text-gray-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* S3-18/19 指令输入 + 渐变圆发送钮 */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-gray-200 p-3 dark:border-white/10"
      >
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-navy-700">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问 Agent 或下达任务…"
            aria-label="向 Agent 输入"
            className="bg-transparent min-w-0 flex-1 text-sm text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
          />
          {/* FE-REFACTOR F002 收敛 common/Button；ARCH-M05 F003：primary 渐变圆（原型 .cop-input button） */}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconOnly
            disabled={busy || !input.trim()}
            aria-label="发送"
            className="shrink-0"
          >
            <MdSend size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}

// 用 useSearchParams 读 ?stage=（项目详情切环节专家）——须 Suspense 包裹（Next 15）。
function CopilotPanelInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stage = searchParams.get('stage');
  const context = deriveContext(pathname ?? '/admin', stage);
  const contextKey = buildContextKey(context);
  // key=contextKey（含 agentId，随 route/env/stage-专家 变化）→ 整个 chat remount（对话清空 + 新专家开场白，FR-12.4）
  return <CopilotChat key={contextKey} context={context} stage={stage} />;
}

export default function CopilotPanel() {
  const { drawerOpen } = useCopilotUi();
  return (
    // 三区外壳右栏：xl 常驻 360px；xl 以下退为 fixed 右滑抽屉（S2-10 cop-toggle / 指令栏 Enter 打开）
    <aside
      className={`fixed right-0 top-0 z-40 flex h-screen w-[360px] max-w-[94vw] flex-col border-l border-gray-200 bg-white transition-transform duration-300 dark:border-white/10 dark:bg-navy-800 ${
        drawerOpen ? 'translate-x-0 shadow-xl' : 'translate-x-[103%]'
      } xl:translate-x-0 xl:shadow-none`}
    >
      <Suspense
        fallback={
          <div className="p-4 text-sm text-gray-400">加载 Copilot…</div>
        }
      >
        <CopilotPanelInner />
      </Suspense>
    </aside>
  );
}
