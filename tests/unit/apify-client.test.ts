// M2-B-CREATORS F001 — apify-kol client + zod 契约单测。
//
// 验收锚点：
// - 契约以真样本 pin（tests/fixtures/apify-kol-samples.json，四平台 2026-07-23 实测脱敏）：
//   YT qualityScore null / IG businessCategory 空串 / following null / matchedTags 空数组
// - passthrough：未知字段原样携带（上游演进不打死）
// - client 错误分类：401/403 auth 终态 / 429 rate_limit 带 Retry-After / 5xx retryable /
//   形状漂移 contract；【P7】fetch 注入不打真服务
// - 【P2】listKols 不带 platform 过滤（URL 断言）

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  apifyKolListResponseSchema,
  apifyKolRowSchema,
} from 'lib/apify/schemas';
import { ApifyKolError, health, listKols } from 'lib/apify/client';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/apify-kol-samples.json', 'utf8'),
) as {
  envelope_example: { page: number; pageSize: number; total: number };
  rows: Array<Record<string, unknown>>;
};

// client 依赖 env：单测统一注入假值（fetch 被 mock，永不真发）
process.env.APIFY_KOL_BASE_URL = 'http://apify-kol.test';
process.env.APIFY_KOL_API_KEY = 'test-key';

function fakeFetch(
  handler: (url: string) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: unknown) => handler(String(input))) as typeof fetch;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('zod 契约（真样本 pin，v0.9.19）', () => {
  it('四平台真样本逐行过 row schema（fix_round 1：X 2 行补齐，四平台在场硬断言）', () => {
    expect(FIXTURE.rows.length).toBeGreaterThanOrEqual(8);
    // 四平台逐一在场（文实一致锚：缺任一平台样本即红——首轮验收 PARTIAL 的回归 pin）
    expect(
      [...new Set(FIXTURE.rows.map((r) => r.platform as string))].sort(),
    ).toEqual(['instagram', 'tiktok', 'x', 'youtube']);
    for (const row of FIXTURE.rows) {
      const r = apifyKolRowSchema.safeParse(row);
      expect(r.success, `row ${row.platform}/${row.username}`).toBe(true);
    }
  });

  it('已知 nullable 形态被容忍：YT qualityScore null / IG businessCategory 空串 / following null', () => {
    const yt = FIXTURE.rows.find((r) => r.platform === 'youtube');
    const ig = FIXTURE.rows.find((r) => r.platform === 'instagram');
    expect(yt).toBeDefined();
    expect(ig).toBeDefined();
    expect(yt!.qualityScore).toBeNull(); // 真样本事实 pin，防上游语义变更被静默吞
    expect(
      apifyKolRowSchema.safeParse({ ...yt, following: null }).success,
    ).toBe(true);
    expect(
      apifyKolRowSchema.safeParse({ ...ig, businessCategory: '' }).success,
    ).toBe(true);
    expect(
      apifyKolRowSchema.safeParse({ ...yt, matchedTags: [] }).success,
    ).toBe(true);
  });

  it('passthrough：未知字段原样携带（上游新增字段不打死）', () => {
    const base = FIXTURE.rows[0];
    const parsed = apifyKolRowSchema.parse({ ...base, futureField: 'x' });
    expect((parsed as Record<string, unknown>).futureField).toBe('x');
  });

  it('信封 {data,page,pageSize,total} 合形；缺信封键拒收（contract 面）', () => {
    const ok = apifyKolListResponseSchema.safeParse({
      ...FIXTURE.envelope_example,
      data: FIXTURE.rows,
    });
    expect(ok.success).toBe(true);
    expect(
      apifyKolListResponseSchema.safeParse({ data: FIXTURE.rows }).success,
    ).toBe(false);
  });
});

describe('listKols client 行为（【P7】fetch 注入）', () => {
  const OK_BODY = { data: [FIXTURE.rows[0]], page: 1, pageSize: 100, total: 1 };

  it('【P2】URL 不带 platform 过滤，分页参数正确 + x-api-key 真经 headers（形状经真信封）', async () => {
    let seenUrl = '';
    let seenApiKey: string | null = null;
    const capturingFetch = (async (input: unknown, init?: RequestInit) => {
      seenUrl = String(input);
      // fix_round 1：header 真断言（原标题声称断言而未断言——文实不符修复）
      seenApiKey = new Headers(init?.headers).get('x-api-key');
      return jsonResponse(OK_BODY);
    }) as typeof fetch;
    const res = await listKols(
      { page: 3, pageSize: 50 },
      { fetch: capturingFetch },
    );
    expect(seenUrl).toBe('http://apify-kol.test/kol?page=3&pageSize=50');
    expect(seenUrl).not.toContain('platform=');
    expect(seenApiKey).toBe('test-key');
    expect(res.total).toBe(1);
    expect(res.data[0].platform).toBe(FIXTURE.rows[0].platform);
  });

  it('401/403 → auth 终态', async () => {
    for (const status of [401, 403]) {
      await expect(
        listKols(
          { page: 1 },
          { fetch: fakeFetch(() => new Response('nope', { status })) },
        ),
      ).rejects.toMatchObject({ name: 'ApifyKolError', kind: 'auth' });
    }
  });

  it('429 → rate_limit + Retry-After 透出', async () => {
    const err = await listKols(
      {
        page: 1,
      },
      {
        fetch: fakeFetch(
          () =>
            new Response('slow down', {
              status: 429,
              headers: { 'retry-after': '7' },
            }),
        ),
      },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApifyKolError);
    expect((err as ApifyKolError).kind).toBe('rate_limit');
    expect((err as ApifyKolError).retryAfterSec).toBe(7);
  });

  it('5xx → retryable；网络异常 → retryable', async () => {
    await expect(
      listKols(
        { page: 1 },
        { fetch: fakeFetch(() => new Response('boom', { status: 502 })) },
      ),
    ).rejects.toMatchObject({ kind: 'retryable' });
    await expect(
      listKols(
        { page: 1 },
        {
          fetch: (async () => {
            throw new Error('ECONNREFUSED');
          }) as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ kind: 'retryable' });
  });

  it('响应形状漂移 → contract 明示（不静默吞）', async () => {
    await expect(
      listKols(
        { page: 1 },
        { fetch: fakeFetch(() => jsonResponse({ rows: [] })) },
      ),
    ).rejects.toMatchObject({ kind: 'contract' });
  });
});

describe('health 探活', () => {
  it('status ok → true；不可达 → false 不抛错（dev 内网不可达属预期）', async () => {
    expect(
      await health({ fetch: fakeFetch(() => jsonResponse({ status: 'ok' })) }),
    ).toBe(true);
    expect(
      await health({
        fetch: (async () => {
          throw new Error('unreachable');
        }) as unknown as typeof fetch,
      }),
    ).toBe(false);
  });
});
