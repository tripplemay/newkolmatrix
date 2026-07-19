// AGENT-FOUNDATION F003 — aigcgateway ⇄ Vercel AI SDK provider
//
// 模型出口 = aigcgateway（OpenAI 兼容端点，apiBaseUrl https://aigc.guangai.ai/v1）。
// 用 @ai-sdk/openai 的 createOpenAI 自定义 baseURL 指向网关（D2/ADR-008）。
// 双链路：chat（tool-calling，走 .chat() = /chat/completions，非 Responses API）+ embedding（bge-m3，1024 维）。
//
// 设计要点：
// - env 懒校验（getGateway 工厂内，非模块顶层）——F005 的 /api/agent route import 本模块后，
//   next build / CI 在无 AIGCGATEWAY_* secret 时也不能因顶层 throw 而构建失败。
// - 密钥只走 env（AIGCGATEWAY_BASE_URL / AIGCGATEWAY_API_KEY），无硬编码。
// - 必用 .chat(modelId)：aigcgateway 是 chat/completions 兼容，provider 默认 callable 走 OpenAI Responses API（网关不支持）。
// - 成本/错误处理骨架：logUsage（token→估算成本，控制台）+ describeGatewayError（清晰错误不静默吞）。
//   真实成本持久化 / 预算闸门留后续（EXTENSION POINT，参考 ai-action-contract §4.7 cost-cap）。
// - max_tokens/timeout 约束见 ai-action-contract.md §2/§4：调用方必传 max_tokens；CJK/长文本 timeout 15s。

import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

// ── 配置常量（env 可覆盖）──
// deepseek-v3：本网关项目已配 active channel + 支持 function_calling + 便宜（$0.26/$0.38）。
// 网关按项目配置路由通道，换模型只改此默认或 env AIGCGATEWAY_CHAT_MODEL。
export const DEFAULT_CHAT_MODEL =
  process.env.AIGCGATEWAY_CHAT_MODEL ?? 'deepseek-v3';
export const DEFAULT_EMBEDDING_MODEL =
  process.env.AIGCGATEWAY_EMBEDDING_MODEL ?? 'bge-m3';
/** bge-m3 输出维度，须与 Prisma Kol.embedding vector(1024) 一致（F002/F004）。 */
export const EMBEDDING_DIMENSIONS = 1024;
/** 默认超时：CJK / 长文本下网关 P95 可达 5-10s，起步 15s（ai-action-contract §2.2）。 */
export const AIGC_TIMEOUT_MS = Number(process.env.AIGC_TIMEOUT_MS ?? 15_000);
/** 默认输出上限（一般业务）；调用方按用例覆盖（ai-action-contract §4.2）。 */
export const DEFAULT_MAX_OUTPUT_TOKENS = Number(
  process.env.AIGC_MAX_OUTPUT_TOKENS ?? 2_000,
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[ai/gateway] 缺少必需环境变量 ${name}。请参照 .env.example 配置（密钥只走 env，不入 git）。`,
    );
  }
  return value;
}

// 空 content 修复（双保险之一，SDK 结构层）：在 SDK 内部消息层给 tool-call-only 的 assistant 消息
// 注入空格 text part（序列化后 content=" "）。与 resilientFetch 的 wire 层补丁互为兜底——实测网关对
// 空 content 一律 400，此问题若漏修会致命，故结构层 + wire 层双重保障。仅包 chat、不碰 embedding。
const emptyAssistantContentMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const prompt = params.prompt.map((msg) => {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return msg;
      const hasText = msg.content.some(
        (p) => p.type === 'text' && p.text.trim() !== '',
      );
      const hasToolCall = msg.content.some((p) => p.type === 'tool-call');
      if (hasToolCall && !hasText) {
        return {
          ...msg,
          content: [{ type: 'text' as const, text: ' ' }, ...msg.content],
        };
      }
      return msg;
    });
    return { ...params, prompt };
  },
};

// resilientFetch — 网关兼容 + 连接池修复，统一在 wire 层（与上面 SDK 中间件互为兜底）。
// 三职：
// (1) 空 content 补丁：网关要求 assistant 消息 content 为非空字符串，但 tool-call-only 的 assistant
//     消息被 OpenAI provider 序列化为 content=""（规范允许 null，网关不允许空，实测 "" → 400，" " → 200）。
//     多步 tool 往返（F005 loop / F006 编排 / F007 对话）会撞此校验；此处把空 content 补成单空格。
//     embedding 请求无 messages 字段 → 补丁自动跳过，不受影响。
// (2) keepalive:false：streamText 的 chat SSE 流用完后，undici 会把连接以坏状态归还全局池，
//     下个复用它的请求（embedding / 多步 chat 下一步）被网关拒 400（空响应体）。
// (3) 空体 400 重试：坏连接 400 后短暂等待重试即拿到新连接 200（实测 undici 丢弃坏连接）。
const GATEWAY_FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 150;

/** 把出站请求体里 tool-call-only 的空 content assistant 消息补成 " "。非 chat 请求原样返回。 */
function patchEmptyAssistantContent(
  body: BodyInit | null | undefined,
): BodyInit | null | undefined {
  if (typeof body !== 'string') return body;
  try {
    const json = JSON.parse(body);
    if (!Array.isArray(json?.messages)) return body;
    let patched = false;
    for (const m of json.messages) {
      // 放宽：任何 content 空/null 的 assistant 消息都补成 " "（网关一律拒空 content，补空格无害）。
      if (m?.role === 'assistant' && (m.content == null || m.content === '')) {
        m.content = ' ';
        patched = true;
      }
    }
    return patched ? JSON.stringify(json) : body;
  } catch {
    return body;
  }
}

const resilientFetch: typeof fetch = async (input, init) => {
  const patchedInit = init
    ? { ...init, keepalive: false, body: patchEmptyAssistantContent(init.body) }
    : init;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, patchedInit);
    // 只对「400 + 空响应体」重试（连接污染特征）；有体的 400（真实坏请求）不重试、直接返回。
    if (res.status !== 400 || attempt >= GATEWAY_FETCH_RETRIES) return res;
    const body = await res
      .clone()
      .text()
      .catch(() => 'x');
    if (body.trim() !== '') return res;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
};

// 懒初始化单例：首次调用时才读 env + 建 provider（避免模块顶层 throw 破坏 build/CI）。
let _gateway: OpenAIProvider | null = null;

/** 取 aigcgateway provider（懒初始化 + env 校验）。 */
export function getGateway(): OpenAIProvider {
  if (_gateway) return _gateway;
  const baseURL = requireEnv('AIGCGATEWAY_BASE_URL');
  const apiKey = requireEnv('AIGCGATEWAY_API_KEY');
  _gateway = createOpenAI({
    name: 'aigcgateway',
    baseURL,
    apiKey,
    fetch: resilientFetch,
  });
  return _gateway;
}

/**
 * Chat 语言模型（tool-calling）。走 .chat() = /chat/completions（aigcgateway 兼容路径）。
 * 空 content 双保险：SDK 中间件（结构层）+ resilientFetch（wire 层）；连接池污染由 resilientFetch 重试兜底。
 */
export function chatModel(modelId: string = DEFAULT_CHAT_MODEL) {
  return wrapLanguageModel({
    model: getGateway().chat(modelId),
    middleware: emptyAssistantContentMiddleware,
  });
}

/** 文本 embedding 模型（bge-m3，1024 维）。用于批量 embed（如 F004 seed embedMany）。 */
export function embeddingModel(modelId: string = DEFAULT_EMBEDDING_MODEL) {
  return getGateway().textEmbeddingModel(modelId);
}

/**
 * 单条文本直连 embedding（直接 fetch 网关 /embeddings，不经 AI SDK）。
 * 缘由：AI SDK 的 embed() 在与 streamText 的 chat 流并发（如 search_kols 在 agent loop 内被调用）时，
 * 底层连接池会间歇报 400 Bad Request（实测：同请求体 curl 恒 200，AI SDK 并发流下间歇失败）。
 * 直连 fetch 每次独立请求，规避该并发冲突。用于 F005 search_kols 这类「工具内嵌 embedding」场景。
 */
export async function embedText(
  value: string,
  modelId: string = DEFAULT_EMBEDDING_MODEL,
): Promise<number[]> {
  const baseURL = requireEnv('AIGCGATEWAY_BASE_URL');
  const apiKey = requireEnv('AIGCGATEWAY_API_KEY');
  const res = await resilientFetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelId, input: value }),
    signal: AbortSignal.timeout(AIGC_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `[ai/gateway] embedText 失败 HTTP ${res.status}: ${(
        await res.text()
      ).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `[ai/gateway] embedText 返回维度异常: ${embedding?.length ?? 'null'}`,
    );
  }
  return embedding;
}

// ── 成本处理骨架 ──
// 网关 list_models 单价（USD / 1M token）。仅列本批用到的模型；扩展点：随用到的模型补充或改为从 list_models 拉取。
const MODEL_PRICE_PER_MTOKEN: Record<
  string,
  { input: number; output: number }
> = {
  'deepseek-v3': { input: 0.26, output: 0.38 },
  'gpt-4o-mini': { input: 0.18, output: 0.72 },
  'qwen3.5-flash': { input: 0.065, output: 0.26 },
};

export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * 成本骨架：把一次调用的 token 用量 + 估算成本打到控制台。
 * EXTENSION POINT：真实成本持久化（OperationLog / 每租户日预算闸门）留后续批次，
 * 对齐 ai-action-contract §4.7 cost-cap MVP。
 */
export function logUsage(model: string, usage: UsageLike | undefined): void {
  if (!usage) return;
  const price = MODEL_PRICE_PER_MTOKEN[model];
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const costStr = price
    ? `~$${((input * price.input + output * price.output) / 1_000_000).toFixed(
        6,
      )}`
    : '(单价未登记)';
  console.log(
    `[ai/gateway] usage model=${model} in=${input} out=${output} total=${
      usage.totalTokens ?? input + output
    } est=${costStr}`,
  );
}

/**
 * 错误处理骨架：把网关调用错误转为清晰、可诊断的信息（不静默吞）。
 * 调用方 catch 后应向上抛或返回明确错误状态，UI 层给 retry（ai-action-contract §2.3）。
 */
export function describeGatewayError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause && error.cause !== error
        ? ` cause=${String(error.cause)}`
        : '';
    return `[ai/gateway] 调用失败: ${error.name}: ${error.message}${cause}`;
  }
  return `[ai/gateway] 调用失败(非 Error): ${String(error)}`;
}
