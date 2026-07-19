// AGENT-FOUNDATION F003 — aigcgateway ⇄ Vercel AI SDK 双链路 smoke
//
// 证明 F003：经 aigcgateway 完成 (1) 一次 chat 且触发 tool-call + (2) 一次 bge-m3 embedding。
// 密钥走 env（.env: AIGCGATEWAY_BASE_URL / AIGCGATEWAY_API_KEY），无硬编码。
//
// 运行：
//   npm run ai:smoke     # = node --env-file=.env --import tsx scripts/test/ai-gateway-smoke.ts
//
// 退出码：0 = 两条链路均通过；1 = 任一失败或异常（失败视为 F003 acceptance 不满足）。
//
// 说明：chat 链路用「单步 + tool 不带 execute」验证 tool-call 触发——模型发出 tool-call 后即停，
// 不进入第二步（避免部分 OpenAI 兼容端点如 deepseek 对 tool-call-only assistant 消息空 content 的拒绝），
// 这已充分满足 acceptance「chat 含 tool-call 触发」。完整 tool 往返执行在 F005 Agent 运行时落地。

import { embed, generateText, tool } from 'ai';
import { z } from 'zod';
import {
  chatModel,
  embeddingModel,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  AIGC_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  logUsage,
  describeGatewayError,
} from '../../src/lib/ai/gateway';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function chatWithToolCall(): Promise<void> {
  console.log(`[ai-smoke] 链路1: chat + tool-call（model=${DEFAULT_CHAT_MODEL}）`);
  const result = await generateText({
    model: chatModel(),
    system:
      '你是 KOLMatrix 的助手。当用户要查询某平台的 KOL 数量时，必须调用 get_kol_count 工具，不要凭空回答。',
    messages: [
      { role: 'user', content: '帮我查一下 youtube 平台现在有多少个 KOL。' },
    ],
    tools: {
      get_kol_count: tool({
        description: '查询指定平台当前已入库的 KOL 数量',
        inputSchema: z.object({
          platform: z
            .string()
            .describe('平台名，如 youtube / twitch / tiktok / instagram'),
        }),
        // 不带 execute：模型发出 tool-call 后 generateText 即停（finishReason=tool-calls），
        // 用于证明 tool-calling 链路触发，不进入第二步。
      }),
    },
    toolChoice: 'auto',
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(AIGC_TIMEOUT_MS),
  });

  assert(result.finishReason === 'tool-calls', `finishReason=tool-calls（实际 ${result.finishReason}）`);
  assert(result.toolCalls.length > 0, `chat 触发了 tool-call（共 ${result.toolCalls.length} 次）`);
  const call = result.toolCalls.find((c) => c.toolName === 'get_kol_count');
  assert(!!call, 'tool-call 命中 get_kol_count（工具名正确）');
  assert(
    !!call && typeof (call.input as { platform?: unknown }).platform === 'string',
    `tool-call 参数含 platform（=${call ? JSON.stringify(call.input) : 'n/a'}）`,
  );
  logUsage(DEFAULT_CHAT_MODEL, result.usage);
}

async function bgeEmbedding(): Promise<void> {
  console.log(`[ai-smoke] 链路2: embedding（model=${DEFAULT_EMBEDDING_MODEL}）`);
  const { embedding, usage } = await embed({
    model: embeddingModel(),
    value: '游戏区英文科技类 YouTuber，粉丝 50 万，测评向',
    abortSignal: AbortSignal.timeout(AIGC_TIMEOUT_MS),
  });
  assert(Array.isArray(embedding), 'embedding 为数组');
  assert(
    embedding.length === EMBEDDING_DIMENSIONS,
    `bge-m3 维度 = ${embedding.length}（须 = ${EMBEDDING_DIMENSIONS}，匹配 Kol.embedding vector(1024)）`,
  );
  assert(
    embedding.every((x) => typeof x === 'number' && Number.isFinite(x)),
    'embedding 全为有限数值',
  );
  logUsage(DEFAULT_EMBEDDING_MODEL, usage);
}

async function main(): Promise<void> {
  console.log('[ai-smoke] aigcgateway ⇄ Vercel AI SDK 双链路验证开始');
  await chatWithToolCall();
  await bgeEmbedding();
  console.log('[ai-smoke] ✅ 双链路全部通过');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // 清晰错误，不静默吞（ai-action-contract §2.3）
    console.error('[ai-smoke] ❌ 失败：', describeGatewayError(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  });
