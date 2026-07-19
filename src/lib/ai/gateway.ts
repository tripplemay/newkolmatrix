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

// 懒初始化单例：首次调用时才读 env + 建 provider（避免模块顶层 throw 破坏 build/CI）。
let _gateway: OpenAIProvider | null = null;

/** 取 aigcgateway provider（懒初始化 + env 校验）。 */
export function getGateway(): OpenAIProvider {
  if (_gateway) return _gateway;
  const baseURL = requireEnv('AIGCGATEWAY_BASE_URL');
  const apiKey = requireEnv('AIGCGATEWAY_API_KEY');
  _gateway = createOpenAI({ name: 'aigcgateway', baseURL, apiKey });
  return _gateway;
}

/** Chat 语言模型（tool-calling）。走 .chat() = /chat/completions（aigcgateway 兼容路径）。 */
export function chatModel(modelId: string = DEFAULT_CHAT_MODEL) {
  return getGateway().chat(modelId);
}

/** 文本 embedding 模型（bge-m3，1024 维）。 */
export function embeddingModel(modelId: string = DEFAULT_EMBEDDING_MODEL) {
  return getGateway().textEmbeddingModel(modelId);
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
