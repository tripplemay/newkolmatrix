// AGENT-FOUNDATION F005/F006 — Agent 运行时（柱二）：streamText 流式 loop + persona 路由
//
// POST 自然语言 + copilot context → persona router 选人格并收窄工具子集 → streamText agent loop
// → 模型自主调工具 → 经唯一执行入口 executeTool（zod 校验 + class 门控）→ 流式返回工具结果 + 文本。
//
// 单一 /api/agent 承载所有专家（不起独立进程，PRD §12.6/FR-12.1）：route 只换人格 system prompt +
// 工具子集，端点不变。人格身份经响应头 X-Agent-Id 暴露（便于验证/前端消费）。
//
// 输入：{ prompt|messages, context?: { route?, projectId?, env?, agentId? } }。
// 运行时 = nodejs（Prisma 不支持 edge）。

import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
} from 'ai';
import {
  chatModel,
  describeGatewayError,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from 'lib/ai/gateway';
import { buildToolContext } from 'lib/agent/context';
import { toAiSdkTools } from 'lib/agent/to-ai-sdk-tools';
import { getTool } from 'lib/agent/tools/registry';
import { ensureNativeToolsRegistered } from 'lib/agent/tools';
import {
  defaultAgentForRoute,
  personaToolSubset,
  selectPersona,
  type CopilotContext,
  type CopilotEnv,
} from 'lib/agent/persona-router';
import { DEFAULT_AGENT_ID, isAgentId } from 'lib/agent/registry';
import { gameKnowledgeSection } from 'lib/agent/knowledge-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_STEPS = 5;
const ENVS: CopilotEnv[] = ['default', 'sandbox', 'production'];

async function toModelMessages(body: unknown): Promise<ModelMessage[]> {
  const b = body as { messages?: unknown; prompt?: unknown };
  if (Array.isArray(b?.messages)) {
    return convertToModelMessages(
      b.messages as Parameters<typeof convertToModelMessages>[0],
    );
  }
  const prompt = typeof b?.prompt === 'string' ? b.prompt : '';
  return [{ role: 'user', content: prompt }];
}

/** 从请求解析 copilot context（服务端解析/校验，不信任客户端范围——架构稿 §4.3）。 */
function resolveContext(body: unknown): CopilotContext {
  const raw = (body as { context?: Record<string, unknown> })?.context ?? {};
  const route = typeof raw.route === 'string' ? raw.route : '/admin';
  const projectId = typeof raw.projectId === 'string' ? raw.projectId : null;
  const env = ENVS.includes(raw.env as CopilotEnv)
    ? (raw.env as CopilotEnv)
    : 'default';
  // agentId：显式指定优先且须合法，否则从 route 推导，最后回落默认（orchestrator）。
  const explicit =
    typeof raw.agentId === 'string' && isAgentId(raw.agentId)
      ? raw.agentId
      : null;
  const agentId = explicit ?? defaultAgentForRoute(route) ?? DEFAULT_AGENT_ID;
  return { route, projectId, env, agentId };
}

export async function POST(req: Request): Promise<Response> {
  try {
    ensureNativeToolsRegistered(); // 确保 native 工具已注册（getTool/toAiSdkTools 依赖）
    const body = await req.json();
    const messages = await toModelMessages(body);
    if (messages.length === 0) {
      return Response.json(
        { error: '缺少 prompt 或 messages' },
        { status: 400 },
      );
    }

    const copilot = resolveContext(body);
    const persona = selectPersona(copilot);
    const ctx = await buildToolContext({
      agentId: copilot.agentId,
      projectId: copilot.projectId,
      env: copilot.env,
    });

    // 收窄工具子集 = 该人格绑定的工具（不同人格看到不同工具）。
    const toolNames = personaToolSubset(persona);
    const tools = toAiSdkTools(toolNames, ctx);

    // ⑤层知识注入（M1-D F005）：经 Project.gameId 查链头按 persona.knowledgeKinds 拼知识段；
    // ctx.projectId 为空 / 人格未声明 kinds / 无知识 → 空串跳过（不注水）。
    const knowledgeSection = copilot.projectId
      ? await gameKnowledgeSection(copilot.projectId, persona.knowledgeKinds)
      : '';

    // 系统提示 = 人格（身份+职责+否定式护栏）+ ⑤层知识段 + 该人格可用工具的使用指引。
    const toolLines = toolNames
      .map((name) => {
        const t = getTool(name);
        return t ? `- ${name}: ${t.description}` : null;
      })
      .filter(Boolean);
    const system =
      persona.systemPrompt +
      knowledgeSection +
      (toolLines.length
        ? `\n\n你可调用的工具（需要时主动调用，基于返回的真实数据作答）：\n${toolLines.join(
            '\n',
          )}`
        : '\n\n（你当前没有可调用的工具，只做本职分析与建议。）');

    const result = streamText({
      model: chatModel(),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      onError: ({ error }) => {
        console.error('[api/agent]', describeGatewayError(error));
      },
    });

    return result.toUIMessageStreamResponse({
      // 工具执行错误默认被 AI SDK 脱敏为 "An error occurred."；服务端 log 真实错误（不静默吞）+ 透传前端。
      onError: (error) => {
        const msg = describeGatewayError(error);
        console.error('[api/agent] tool/stream error:', msg);
        return msg;
      },
      // 暴露人格身份 + 边界（F007 对话面顶部常驻显示 duty + 否定式护栏用）。
      headers: {
        'X-Agent-Id': persona.id,
        'X-Agent-Tools': persona.tools.join(',') || '(none)',
      },
    });
  } catch (error) {
    console.error('[api/agent] fatal:', describeGatewayError(error));
    return Response.json(
      { error: describeGatewayError(error) },
      { status: 500 },
    );
  }
}
