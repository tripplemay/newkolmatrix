// AGENT-FOUNDATION F005 — Agent 运行时（柱二）：streamText 流式 loop
//
// POST 自然语言 → streamText agent loop（单轮 maxSteps 上限）→ 模型自主调 search_kols
// → 经唯一执行入口 executeTool（zod 校验 + class 门控）→ 流式返回工具结果 + 文本。
//
// 输入：{ prompt: string }（curl 便捷）或 { messages: UIMessage[] }（F007 useChat）。
// 人格路由/工具子集收窄在 F006；本批用 native 工具全集。outbound 服务端强制拦截在 F009。
//
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
import { getNativeToolNames } from 'lib/agent/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_STEPS = 5;

const SYSTEM_PROMPT = [
  '你是 KOLMatrix 的 AI 助手，帮助运营者跨平台发现、评估 KOL。',
  '当用户想「找 / 检索某类 KOL」时，调用 search_kols（自然语言意图 → 语义检索）。',
  '当用户想看某个 KOL 的详细资料时，调用 get_kol_detail。',
  '基于工具返回的真实数据作答，不要编造 KOL；没有结果就如实说没找到。',
].join('\n');

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

export async function POST(req: Request): Promise<Response> {
  try {
    const messages = await toModelMessages(await req.json());
    if (messages.length === 0) {
      return Response.json(
        { error: '缺少 prompt 或 messages' },
        { status: 400 },
      );
    }

    const ctx = await buildToolContext();
    const tools = toAiSdkTools(getNativeToolNames(), ctx);

    const result = streamText({
      model: chatModel(),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      onError: ({ error }) => {
        // 清晰错误，不静默吞（错误也会经流式 error part 抵达前端）
        console.error('[api/agent]', describeGatewayError(error));
      },
    });

    return result.toUIMessageStreamResponse({
      // 工具执行错误默认被 AI SDK 脱敏为 "An error occurred."；这里在服务端 log 真实错误
      // （不静默吞），并把可诊断信息透传前端（本批无认证的 dev 地基，便于排障）。
      onError: (error) => {
        const msg = describeGatewayError(error);
        console.error('[api/agent] tool/stream error:', msg);
        return msg;
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
