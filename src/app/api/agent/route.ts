// AGENT-FOUNDATION F005/F006 — Agent 运行时（柱二）：streamText 流式 loop + persona 路由
//
// POST 自然语言 + copilot context → persona router 选人格并收窄工具子集 → streamText agent loop
// → 模型自主调工具 → 经唯一执行入口 executeTool（zod 校验 + class 门控）→ 流式返回工具结果 + 文本。
//
// 单一 /api/agent 承载所有专家（不起独立进程，PRD §12.6/FR-12.1）：route 只换人格 system prompt +
// 工具子集，端点不变。人格身份经响应头 X-Agent-Id 暴露（便于验证/前端消费）。
//
// 【M4.5 F009】loop 装配已抽到 lib/agent/loop.ts（带 model/ctx 注入缝，供 mock-model 测试床
// 驱动同一条装配路径）。本文件只留 HTTP 边界：请求解析、context 校验、响应头、错误处理。
//
// 输入：{ prompt|messages, context?: { route?, projectId?, env?, agentId? } }。
// 运行时 = nodejs（Prisma 不支持 edge）。

import { convertToModelMessages, type ModelMessage } from 'ai';
import { describeGatewayError } from 'lib/ai/gateway';
import { runAgentLoop } from 'lib/agent/loop';
import {
  defaultAgentForRoute,
  type CopilotContext,
  type CopilotEnv,
} from 'lib/agent/persona-router';
import { DEFAULT_AGENT_ID, isAgentId } from 'lib/agent/registry';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    const body = await req.json();
    const messages = await toModelMessages(body);
    if (messages.length === 0) {
      return Response.json(
        { error: '缺少 prompt 或 messages' },
        { status: 400 },
      );
    }

    const copilot = resolveContext(body);
    const { persona, result } = await runAgentLoop({ copilot, messages });

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
