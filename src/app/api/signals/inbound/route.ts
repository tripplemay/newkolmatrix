// M3-A-REACH-CRM F004 — POST /api/signals/inbound：Resend webhook 接收（signals 接入层）
//
// P4：验签处理模式 port 自旧项目 webhooks/resend/route.ts（BL-035-F006）：
// Svix 标准三头（svix-id/timestamp/signature）+ 原始 body 交给 Webhook.verify——
// 重放签名、拒 5 分钟外时间戳；secret 未配 → 500 拒收（不静默接受）。
// P9：20 req/min/IP 进程内限流 fail-closed（验签为主闸，限流防滥打；取不到 IP 也拒）。
// zod 校验坏 payload → 400 不落库；externalId 防重、matched=0 语义见 ingest.ts。
// 运行时 = nodejs（Prisma + svix crypto）。

import { Webhook, type WebhookRequiredHeaders } from 'svix';
import { getDevTenantId } from 'lib/agent/context';
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
    const tenantId = await getDevTenantId();
    const result = await ingestDeliverySignal(normalized.signal, { tenantId });
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
