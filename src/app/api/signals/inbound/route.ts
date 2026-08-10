// M3-A-REACH-CRM F004 — POST /api/signals/inbound：Resend webhook 接收（signals 接入层）
//
// P4：验签处理模式 port 自旧项目 webhooks/resend/route.ts（BL-035-F006）：
// Svix 标准三头（svix-id/timestamp/signature）+ 原始 body 交给 Webhook.verify——
// 重放签名、拒 5 分钟外时间戳；secret 未配 → 500 拒收（不静默接受）。
// P9：20 req/min/IP 进程内限流 fail-closed（验签为主闸，限流防滥打；取不到 IP 也拒）。
// zod 校验坏 payload → 400 不落库；externalId 防重、matched=0 语义见 ingest.ts。
// 运行时 = nodejs（Prisma + svix crypto）。

import { Webhook, type WebhookRequiredHeaders } from 'svix';
import { DEV_TENANT_SLUG, systemTenantId } from 'lib/agent/context';
import { withTenant } from 'lib/db/tenant-scope';
import {
  checkRateLimit,
  clientIpOf,
  isRateLimitDisabled,
} from 'lib/http/rate-limit';
import {
  normalizeResendEvent,
  resendWebhookEventSchema,
} from 'lib/signals/normalize';
import { ingestDeliverySignal } from 'lib/signals/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNALS_LIMIT = 20;
const SIGNALS_WINDOW_MS = 60 * 1000;

/** P9 fail-closed：取不到 IP / 超限一律拒（webhook 安全敏感；nginx 反代必带 xff）。 */
function signalsRateLimitGuard(req: Request): Response | null {
  if (isRateLimitDisabled()) return null;
  const ip = clientIpOf(req);
  if (!ip) {
    return Response.json(
      { ok: false, error: 'client_ip_unresolved' },
      { status: 403 },
    );
  }
  const verdict = checkRateLimit('signals', ip, {
    limit: SIGNALS_LIMIT,
    windowMs: SIGNALS_WINDOW_MS,
  });
  if (verdict.allowed) return null;
  return Response.json(
    { ok: false, error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } },
  );
}

function extractSvixHeaders(req: Request): WebhookRequiredHeaders | null {
  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signature = req.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return null;
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
  };
}

export async function POST(req: Request): Promise<Response> {
  const limited = signalsRateLimitGuard(req);
  if (limited) return limited;

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // fail-closed：未配置不得静默接受（旧项目同语义）
    console.error('[signals/inbound] RESEND_WEBHOOK_SECRET 未配置');
    return Response.json(
      { ok: false, error: 'not_configured' },
      { status: 500 },
    );
  }

  // 原始 body 先读（svix 签名针对确切字节重放）
  const rawBody = await req.text();
  const headers = extractSvixHeaders(req);
  if (!headers) {
    return Response.json(
      { ok: false, error: 'bad_signature' },
      { status: 401 },
    );
  }

  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(rawBody, headers);
  } catch {
    return Response.json(
      { ok: false, error: 'bad_signature' },
      { status: 401 },
    );
  }

  // 验签只证真伪，形状仍须校验：坏 payload 400 不落库
  const parsed = resendWebhookEventSchema.safeParse(verified);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'invalid_payload' },
      { status: 400 },
    );
  }

  const normalized = normalizeResendEvent(parsed.data, headers['svix-id']);
  if (!normalized.ok) {
    // 非四类事件 / 缺 email_id：诚实忽略，响应形状不破（旧项目同语义）
    return Response.json({ ok: true, matched: 0, duplicate: false });
  }

  try {
    // M5-AUTH-RLS F004（spec D-3 无会话面）：webhook 自鉴权（svix 签名）、无浏览器会话，
    // 故走**显式**系统租户路径而不是会话。**已知限制**：回传源当前只对应 dev 租户——
    // 真 partner / 真回传源的多租户路由属 M5 伞下另批（spec §3 明列不做）。
    // 显式写出来是刻意的：读这一行就知道信号落到哪个租户，而不是藏在一个函数名里。
    // M5.2-TENANT-COVERAGE F004（acceptance ②）— **无会话面**入口，接法与其余 9 条不同：
    // 没有登录会话可解，所以不是 withSessionTenant，而是先显式解析出 tenantId 再 withTenant
    //（样板 = src/lib/jobs/scheduler.ts 的 health-scan）。
    //
    // 【tenantId 从哪来】下面那行的 systemTenantId：slug → 租户 id，走引导面 privilegedDb
    //（租户是它的产物，此刻还没有租户变量可设，见 lib/agent/context 的 tenantIdBySlug）。
    //
    // 【解析不出时怎么办：fail-closed，绝不回落到任意租户】tenantIdBySlug 查不到即**抛错**，
    // 由下面的 catch 兜成 500 apply_failed —— 信号不落库、Resend 按 at-least-once 重投。
    // 这里刻意没有「找不到就用第一个租户 / 默认租户」之类的兜底：那等于把外部回传写进
    // 一个碰巧存在的租户名下，且不报错、不留痕、事后无从发现（同 spec D-3 对会话面回落的判定）。
    // 判据：tests/integration/m52-f004-signals-tenant.test.ts。
    const tenantId = await systemTenantId(DEV_TENANT_SLUG);
    const result = await withTenant(tenantId, () =>
      ingestDeliverySignal(normalized.signal, { tenantId }),
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[signals/inbound] 应用失败:', err);
    // externalId 防重使重试安全 → 返 500 让 Resend 重投（at-least-once；
    // 与旧项目「返 200 防重试」不同：旧项目无防重键，我们有）
    return Response.json(
      { ok: false, error: 'apply_failed' },
      { status: 500 },
    );
  }
}
