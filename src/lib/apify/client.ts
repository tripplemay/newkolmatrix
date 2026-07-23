// M2-B-CREATORS F001 — apify-kol HTTP client（外采服务，拉模型只读）。
//
// 服务实物（spec §1.1）：deploysvr 内网 `kol-shared` 网络别名 `apify-kol:3003`
//（prod compose F008 接线）；本地开发不可达内网——L2 实测走 ssh 隧道
// `ssh -L 3004:localhost:3004 deploysvr` + APIFY_KOL_BASE_URL=http://localhost:3004。
// 认证：`x-api-key`（BUSINESS 只读 key，env 注入不入 git）。
//
// 【P1】本 client 只封装只读端点（/kol /health）——/admin/seeds 投喂与任何花钱动作
// 不在此出现（TikHub spend 永留人工，harness deny-list 取向）。
// 【P2】listKols 不带 platform 过滤：上游 GET /kol 的 platform 枚举缺 x（已知遗留），
// 全量分页拉取绕过，响应行自带 platform 无信息损失。
// 【P7】fetch 可注入（单测不打真服务）；错误分类沿旧 kolmatrix adapter 语义独立实现：
// 401/403 终态（配置错，重试无意义）· 429 尊重 Retry-After · 5xx/超时/网络 可重试。

import {
  apifyKolListResponseSchema,
  type ApifyKolListResponse,
} from './schemas';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[apify] 缺少必需环境变量 ${name}。请参照 .env.example 配置（密钥只走 env，不入 git）。`,
    );
  }
  return value;
}

/** 请求超时（外采服务内网往返 + DB 查询，10s 起步；可 env 调）。 */
export const APIFY_KOL_TIMEOUT_MS = Number(
  process.env.APIFY_KOL_TIMEOUT_MS ?? 10_000,
);

/** 错误分类（调用方按 kind 决定重试/终止；sync F003 逐页消化）。 */
export type ApifyKolErrorKind =
  | 'auth' // 401/403：key 配置错，终态不重试
  | 'rate_limit' // 429：尊重 Retry-After
  | 'retryable' // 5xx / 超时 / 网络
  | 'contract'; // 响应形状与契约不符（上游漂移）

export class ApifyKolError extends Error {
  readonly kind: ApifyKolErrorKind;
  /** 429 时上游给出的重试等待秒数（无则 null） */
  readonly retryAfterSec: number | null;

  constructor(
    kind: ApifyKolErrorKind,
    message: string,
    retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'ApifyKolError';
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}

/** 【P7】注入点：单测替换 fetch 不打真服务。 */
export interface ApifyKolClientDeps {
  fetch?: typeof fetch;
}

export interface ListKolsParams {
  page: number;
  /** 上游上限 100（spec §1.1） */
  pageSize?: number;
}

async function request(
  path: string,
  deps: ApifyKolClientDeps,
): Promise<Response> {
  const baseURL = requireEnv('APIFY_KOL_BASE_URL');
  const apiKey = requireEnv('APIFY_KOL_API_KEY');
  const doFetch = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseURL}${path}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(APIFY_KOL_TIMEOUT_MS),
    });
  } catch (err) {
    // 超时 / 网络失败：可重试类
    throw new ApifyKolError(
      'retryable',
      `[apify] 请求失败 ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApifyKolError(
      'auth',
      `[apify] 认证失败 HTTP ${res.status}（检查 APIFY_KOL_API_KEY）`,
    );
  }
  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after'));
    throw new ApifyKolError(
      'rate_limit',
      '[apify] 上游限流 HTTP 429',
      Number.isFinite(ra) && ra > 0 ? ra : null,
    );
  }
  if (!res.ok) {
    throw new ApifyKolError(
      'retryable',
      `[apify] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  return res;
}

/**
 * 分页拉取 KOL 存量（【P2】不带 platform 过滤）。
 * 响应过 zod 契约（passthrough 宽容）；形状漂移 → contract 错误明示，不静默吞。
 */
export async function listKols(
  { page, pageSize = 100 }: ListKolsParams,
  deps: ApifyKolClientDeps = {},
): Promise<ApifyKolListResponse> {
  const res = await request(`/kol?page=${page}&pageSize=${pageSize}`, deps);
  const json: unknown = await res.json();
  const parsed = apifyKolListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApifyKolError(
      'contract',
      `[apify] GET /kol 响应形状漂移（上游契约变更？）: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** 探活（/health 免鉴权，但统一走带 key 请求无副作用）。失败返回 false 不抛错。 */
export async function health(deps: ApifyKolClientDeps = {}): Promise<boolean> {
  try {
    const res = await request('/health', deps);
    const json = (await res.json()) as { status?: string };
    return json.status === 'ok';
  } catch {
    return false; // dev 内网不可达属预期（spec §2 F003：探活失败静默跳过）
  }
}
