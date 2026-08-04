// AGENT-FOUNDATION F007 — 常驻对话面（柱三）：多 Agent 对话驱动面
//
// Horizon 外壳右栏常驻 Copilot 面板，useChat 接 /api/agent（F005 流式 loop）。
// - 消息气泡（还原设计稿 .cmsg：user 渐变右 / agent 浅色左）
// - generative canvas：工具结果经 canvas-registry 渲染（search_kols → KOL 卡片流）
// - **单一前台（M4.7 F003 起）**：受理人格恒为前台，进不同 route **不再**切人格；
//   专家降为内部能力（前台经 consult_specialist 内部咨询），协作痕迹以 ConsultationNote 呈现
//
// ARCH-M05 F003 升级（原型 S3 19 元素）：
// - cop-head 渐变随专家主题色（agent-theme 本地色表）+ dm 图标块 + 动态专家名/副标题
// - cop-auto 边界条（🔒 D26/D27 宣示）· 职责/隔离卡（ExpertScope）或编队紧凑名册（AgentSquad compact，仅编排上下文）
// - 「{专家}刚刚完成」卡 · 协同卡升级（HandoffCollab，逐轮台词 mock）· 动作卡（enter:/pick:/env:）
// - 建议 chips（每上下文 3 条）· 渐变圆发送钮（Button primary iconOnly）
// - 移动端退为 fixed 右滑抽屉（navbar cop-toggle / 指令栏 Enter 经 CopilotUiContext 控制）

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MdCheck, MdSend, MdShield } from 'react-icons/md';
import {
  buildContextKey,
  type CopilotContext,
} from 'lib/agent/persona-router';
import { WHITE } from 'lib/design-tokens';
import {
  personaBoundary,
  isAgentId,
  FRONT_DESK_AGENT_ID,
  type AgentId,
} from 'lib/agent/registry';
import { agentTheme } from 'lib/agent/agent-theme';
import { isStage } from 'lib/agent/stage-routing';
import { useCopilotUi } from 'contexts/CopilotUiContext';
import Button from 'components/common/Button';
import ChatBubble from 'components/common/ChatBubble';
import AgentSquad, { AGENT_ICONS } from 'components/common/AgentSquad';
import ExpertScope from './ExpertScope';
import PersonaSwitchNote, {
  type PersonaSwitchData,
} from './PersonaSwitchNote';
import HandoffCollab from './HandoffCollab';
import ActionCard from './ActionCard';
import PendingBatchCard from 'components/common/PendingBatchCard';
import type { PendingBatchItem } from 'lib/gate/pending-items';
import { mockCopilotUi } from './mock';
import {
  pickToolRenderMode,
  renderToolInputDraft,
  renderToolResult,
} from './canvas/canvas-registry';

function deriveContext(
  pathname: string,
  stageParam: string | null,
): CopilotContext {
  const route = pathname || '/admin';
  // 项目详情 /admin/campaigns/[id]：projectId 从路径解析；?env= 指定环节 → 切该环节专家（F008 五环节唯一容器；F007 迁移 ?stage=→?env=）。
  // 命名歧义警示（architecture §6.1）：URL ?env= 指五环节（Stage）；下方 CopilotContext.env 是运行环境（default/sandbox/production），同名不同义。
  // M4.7 F003：**受理人格恒为前台**——页面不再决定谁有发言权（本批根因）。
  // 环节改以 stage 线索传给服务端，只影响 system 里"用户在看什么"，不影响权限。
  const projMatch = route.match(/^\/admin\/campaigns\/([^/]+)$/);
  if (projMatch && projMatch[1] !== undefined) {
    return {
      route,
      projectId: projMatch[1],
      env: 'default',
      agentId: FRONT_DESK_AGENT_ID,
      stage: stageParam && isStage(stageParam) ? stageParam : null,
    };
  }
  return {
    route,
    projectId: null,
    env: 'default',
    agentId: FRONT_DESK_AGENT_ID,
    stage: null,
  };
}

/** 流内人格切换事件的 part 类型（与 route.ts 写入端同源；导出供回归断言钉死）。 */
export const PERSONA_SWITCH_PART = 'data-persona_switch';
/**
 * 撞顶告知（M4.7 fix_round1 / F006）。服务端在 loop 用满预算时写这条 data part——
 * 那一刻模型已无开口机会，不补这一句用户拿到的就是**完全空白的回复**。
 *
 * 【为什么单独列出来】首轮对抗复核残留缺口 R-2：服务端写了、面板没有渲染分支，
 * 于是告知**到不了用户眼前**——写进流不等于用户看得见。
 */
export const BUDGET_NOTICE_PART = 'data-budget_notice';
/**
 * 超时告知（M4.8 F004 / D-4）。服务端在主 loop 撞墙钟闸时写这条 data part——
 * 那一刻流被 abort，模型同样没有开口的机会，用户端此前只剩 start + abort + [DONE]。
 *
 * 【为什么渲染分支与写入端同 commit】仓内不变式钉（m47-adv-probe P7b）：route 往流里
 * 写的每一种 data part，面板都必须有渲染分支——"写进流 ≠ 用户看得见"（R-2 的原话）。
 * 写入端单独落地即当场翻红，故这两行不能等到下一个 commit。
 */
export const TIMEOUT_NOTICE_PART = 'data-timeout_notice';

/**
 * 从消息流里解析**当值人格**（P9）：取最后一次 persona_switch 事件的 to。
 * 无切换 → 回落 context.agentId（行为与 M4.5 前完全一致）。
 * 响应头 X-Agent-Id 只带起始人格，切换史只在流内——故这里读流不读头。
 */
export function activeAgentFromMessages(
  messages: ReadonlyArray<{ parts?: unknown[] }>,
  fallback: AgentId,
): AgentId {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = (messages[i].parts ?? []) as Array<{
      type?: string;
      data?: PersonaSwitchData;
    }>;
    for (let j = parts.length - 1; j >= 0; j--) {
      if (parts[j]?.type !== PERSONA_SWITCH_PART) continue;
      const to = parts[j]?.data?.to;
      if (typeof to === 'string' && isAgentId(to)) return to;
    }
  }
  return fallback;
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
          input?: unknown;
          data?: PersonaSwitchData & { notice?: string };
        };
        // M4.8 F004：超时告知——与撞顶告知同一条纪律（服务端补的那一句必须到得了眼前）
        if (part.type === TIMEOUT_NOTICE_PART) {
          const notice = (part.data as { notice?: string } | undefined)?.notice;
          return notice ? (
            <div
              key={i}
              data-testid="timeout-notice"
              className="my-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              {notice}
            </div>
          ) : null;
        }
        // M4.7 F006：撞顶告知——服务端补的那一句必须真的渲染出来（R-2）
        if (part.type === BUDGET_NOTICE_PART) {
          const notice = (part.data as { notice?: string } | undefined)?.notice;
          return notice ? (
            <div
              key={i}
              data-testid="budget-notice"
              className="my-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              {notice}
            </div>
          ) : null;
        }
        // M4.5 F006：人格切换事件（流内 data part）→ 接手标注
        if (part.type === PERSONA_SWITCH_PART) {
          return <PersonaSwitchNote key={i} data={part.data ?? {}} />;
        }
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
          // ADR-28（M2-A F007）：结果路由键 = 结果 type 优先、工具名回退（判定需带 output）；
          // M4.5 F008（裁决 C）：模型正在写入参时先出渐进卡。三分支互斥，见 pickToolRenderMode。
          const mode = pickToolRenderMode(toolName, part.state, part.output);
          if (mode === 'canvas') {
            return <div key={i}>{renderToolResult(toolName, part.output)}</div>;
          }
          if (mode === 'draft') {
            return <div key={i}>{renderToolInputDraft(toolName, part.input)}</div>;
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

/**
 * M4.5 F007 — 面板内「已备好 N 件待确认」聚合卡。
 *
 * 只读取数（GET /api/actions），确认动线仍是逐项两步票据（PendingBatchCard 内）。
 * **无 pending 时不渲染**：面板是常驻的，空卡会变成永久占位的噪音；空态诚实由今天页
 * 雷达区既有空态文案承担。取数失败静默降级为不渲染（对话主链路不得被侧栏取数打死）。
 */
function CopilotPendingBatch() {
  const [items, setItems] = useState<PendingBatchItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/actions')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { items?: PendingBatchItem[] } | null) => {
        if (alive && body?.items) setItems(body.items);
      })
      .catch(() => {
        /* 取数失败 → 不渲染（D2 静默降级，不打死对话面） */
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!items || items.length === 0) return null;
  return <PendingBatchCard items={items} />;
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

  // M4.5 F006（P9）：当值人格随流内切换事件走；无切换恒为 context.agentId（零行为变化）。
  const activeAgentId = useMemo(
    () =>
      activeAgentFromMessages(
        messages as unknown as ReadonlyArray<{ parts?: unknown[] }>,
        context.agentId,
      ),
    [messages, context.agentId],
  );
  const persona = personaBoundary(activeAgentId);
  const theme = agentTheme(activeAgentId);
  const HeadIcon = AGENT_ICONS[activeAgentId];
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
          background: `linear-gradient(135deg, color-mix(in srgb, ${theme.color} 55%, ${WHITE}), ${theme.color})`,
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
        {/* M4.5 F006：一旦发生过接力，无论哪条路由都改显当值人格的边界卡（duty + 否定式护栏） */}
        {ui.squad && activeAgentId === context.agentId ? (
          <AgentSquad variant="compact" />
        ) : (
          <ExpertScope agentId={activeAgentId} />
        )}
        <RecentlyDone name={persona?.name ?? 'Agent'} items={ui.did} />
        {/* M4.5 F007：已备好待确认的聚合卡（有才显示） */}
        <CopilotPendingBatch />
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

// 用 useSearchParams 读 ?env=（M4.7 F003 起：环节只作为**线索**进 system，不再选专家）
// ——须 Suspense 包裹（Next 15）。旧深链 ?stage= 兜底读：ProjectDetail 会 router.replace
// 重写为 ?env=，兜底避免重写瞬态丢失线索。
function CopilotPanelInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stage = searchParams.get('env') ?? searchParams.get('stage');
  const context = deriveContext(pathname ?? '/admin', stage);
  const contextKey = buildContextKey(context);
  // key=contextKey（= route:projectId:env:agentId，**不含 stage**）→ 变化时整个 chat remount。
  // 【M4.7 F003 后的实际行为，与旧注释相反】agentId 现已恒为前台，故**同一项目内切
  // ?env= 不再 remount、对话不再清空**——切环节只是换了 system 里的位置线索。
  // 跨项目 / 跨 route 仍会 remount（projectId、route 变了）。
  return <CopilotChat key={contextKey} context={context} stage={stage} />;
}

export default function CopilotPanel() {
  const { drawerOpen, closeDrawer } = useCopilotUi();
  return (
    // 三区外壳右栏：xl 常驻 360px；xl 以下退为 fixed 右滑抽屉（S2-10 cop-toggle / 指令栏 Enter 打开）。
    // ARCH-M05 fixing FIX-4（verify-B O-2）：aside z-40→z-10 恢复原型层叠（navbar z-20 在上，
    // cop-toggle 双向可用）；补 mobile scrim（点击关闭，接 closeDrawer）——抽屉不再单向不可关。
    <>
      {drawerOpen && (
        <div
          aria-hidden
          onClick={closeDrawer}
          className="fixed inset-0 z-[5] bg-navy-900/50 backdrop-blur-[2px] xl:hidden"
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-10 flex h-screen w-[360px] max-w-[94vw] flex-col border-l border-gray-200 bg-white transition-transform duration-300 dark:border-white/10 dark:bg-navy-800 ${
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
    </>
  );
}
