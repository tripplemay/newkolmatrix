// M3-A-REACH-CRM F007 — Kol.contactEmail 录入集成测试（打真库，match-approve 夹具先例）。
//
// 变异断言设计：
// 1. 录入落库 + fieldProvenance 合并写：contactEmail 键新增（条目对象形状 source=user_input）、
//    既有键原样保留（杀「整体覆盖丢键」变异——D15 溯源丢键即事故）；
// 2. 溯源解析联动：resolveProvenance 出 field 级 user_input，且其他键不被击穿
//    （杀「flat 字符串写法击穿 fieldProvenanceSchema 整表解析、连带全部字段级溯源降级」变异）；
// 3. PATCH 路由坏格式 400 明示（route 先校验后租户——不依赖 dev tenant，CI 无 seed 库可跑）；
// 4. 清除语义：列置空 + fieldProvenance.contactEmail 键移除、其他键保留（杀「孤儿溯源键」变异）；
//    无其他键的行清除后回落 SQL NULL（不留空对象壳）；
// 5. F003 联动（acceptance 5）：录入落库后按 send_outreach 读侧同款查询
//    （findFirst id+tenantId select contactEmail）取到非空地址即联动成立——无需真发信。
//
// ⚠️ P1：本测试仅对夹具租户内的夹具行写入 @test.invalid 地址，不触碰真实 KOL 行。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  CONTACT_EMAIL_INVALID_MSG,
  normalizeContactEmailInput,
  setKolContactEmail,
} from '../../src/lib/kols/contact-email';
import { PATCH } from '../../src/app/api/kols/[id]/contact/route';
import { resolveProvenance } from '../../src/lib/data/provenance';

const FIXTURE_SLUG = `test-tenant-m3a-contact-${process.pid}`;
const TEST_EMAIL = `m3a-contact-${process.pid}@test.invalid`;

/** 夹具行既有字段级溯源（合并写必须原样保留的「其他键」）。 */
const EXISTING_PROV = {
  audienceDemo: {
    source: 'crawl',
    fetchedAt: '2026-07-01T00:00:00.000Z',
    confidence: 'medium',
  },
} as const;

let tenantId: string;
let kolId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A contact 集成测试夹具租户' },
  });
  tenantId = t.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-contact-kol-${process.pid}`,
      displayName: 'contact 夹具创作者',
      dataSource: 'crawl',
      fieldProvenance: EXISTING_PROV as unknown as Prisma.InputJsonValue,
    },
  });
  kolId = k.id;
});

afterAll(async () => {
  // 夹具租户整体清零（D-H：测毕复原）
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** 直调 route handler（signals-inbound 先例）；400 断言路径不依赖 dev tenant。 */
function invokePatch(body: unknown): Promise<Response> {
  const req = new Request('https://example.test/api/kols/x/contact', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: 'kol-nonexistent' }) });
}

describe('normalizeContactEmailInput（纯函数：清除/trim/坏格式）', () => {
  it('null / 空串 / 纯空白 → 清除语义（value=null）', () => {
    expect(normalizeContactEmailInput(null)).toEqual({ ok: true, value: null });
    expect(normalizeContactEmailInput('')).toEqual({ ok: true, value: null });
    expect(normalizeContactEmailInput('   ')).toEqual({ ok: true, value: null });
  });

  it('合法地址 trim 后原样通过；坏格式明示拒绝', () => {
    expect(normalizeContactEmailInput('  a@b.co  ')).toEqual({
      ok: true,
      value: 'a@b.co',
    });
    for (const bad of ['not-an-email', 'a@', '@b.co', 'a b@c.co']) {
      expect(normalizeContactEmailInput(bad)).toEqual({
        ok: false,
        error: CONTACT_EMAIL_INVALID_MSG,
      });
    }
  });
});

describe('录入落库 + fieldProvenance 合并（变异断言 1/2）', () => {
  it('录入成功：contactEmail 落库、fieldProvenance 增 user_input 条目、既有键原样保留', async () => {
    const r = await setKolContactEmail(tenantId, kolId, TEST_EMAIL);
    expect(r.ok).toBe(true);

    const row = await prisma.kol.findUniqueOrThrow({ where: { id: kolId } });
    expect(row.contactEmail).toBe(TEST_EMAIL);

    const fp = row.fieldProvenance as Record<string, unknown>;
    // 合并写：既有键逐字保留（杀整体覆盖变异）
    expect(fp.audienceDemo).toEqual(EXISTING_PROV.audienceDemo);
    // 新键 = 条目对象形状（非 flat 字符串）
    const entry = fp.contactEmail as { source: string; fetchedAt: string };
    expect(entry.source).toBe('user_input');
    expect(Number.isNaN(Date.parse(entry.fetchedAt))).toBe(false);
  });

  it('resolveProvenance 联动：contactEmail 出 field 级 user_input，其他键不被击穿', async () => {
    const row = await prisma.kol.findUniqueOrThrow({ where: { id: kolId } });
    const carrier = {
      dataSource: row.dataSource,
      fieldProvenance: row.fieldProvenance,
    };

    // ProvenanceTag 正确显示的机械前提（acceptance 4）：field 级解析成功
    const contact = resolveProvenance(carrier, 'contactEmail');
    expect(contact.source).toBe('user_input');
    expect(contact.resolvedFrom).toBe('field');

    // flat 字符串写法会让整表 safeParse 失败 → audienceDemo 也降级 row；此处断言不发生
    const aud = resolveProvenance(carrier, 'audienceDemo');
    expect(aud.source).toBe('crawl');
    expect(aud.resolvedFrom).toBe('field');
  });
});

describe('F003 联动（acceptance 5）', () => {
  it('录入落库后，send_outreach 读侧同款查询取到非空 contactEmail——联动成立（无需真发信）', async () => {
    // send-outreach.ts resolveKol 同款查询形状：findFirst({ id, tenantId }, select contactEmail）
    const kol = await prisma.kol.findFirst({
      where: { id: kolId, tenantId },
      select: { contactEmail: true },
    });
    expect(kol?.contactEmail).toBe(TEST_EMAIL);
  });
});

describe('清除语义（变异断言 4）', () => {
  it('email=null：列置空 + fieldProvenance.contactEmail 键移除、其他键保留', async () => {
    const r = await setKolContactEmail(tenantId, kolId, null);
    expect(r.ok).toBe(true);

    const row = await prisma.kol.findUniqueOrThrow({ where: { id: kolId } });
    expect(row.contactEmail).toBeNull();

    const fp = row.fieldProvenance as Record<string, unknown>;
    expect('contactEmail' in fp).toBe(false); // 无孤儿溯源键（§7.5.2 读写不对称）
    expect(fp.audienceDemo).toEqual(EXISTING_PROV.audienceDemo);
  });

  it('无其他溯源键的行：清除后 fieldProvenance 回落 null（不留空对象壳）', async () => {
    const k2 = await prisma.kol.create({
      data: {
        tenantId,
        canonicalHandle: `m3a-contact-kol2-${process.pid}`,
        displayName: 'contact 夹具创作者 2（无既有溯源）',
      },
    });
    await setKolContactEmail(tenantId, k2.id, TEST_EMAIL);
    await setKolContactEmail(tenantId, k2.id, null);

    const row = await prisma.kol.findUniqueOrThrow({ where: { id: k2.id } });
    expect(row.contactEmail).toBeNull();
    expect(row.fieldProvenance).toBeNull();
  });

  it('不存在的 kol → NOT_FOUND（跨租户 id 同样拒）', async () => {
    const r = await setKolContactEmail(tenantId, 'kol-nonexistent', TEST_EMAIL);
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('PATCH 路由坏格式 400 明示（变异断言 3，acceptance 2）', () => {
  it('坏格式地址 → 400 + 明示文案（zod email 校验）', async () => {
    const res = await invokePatch({ contactEmail: 'not-an-email' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe(CONTACT_EMAIL_INVALID_MSG);
  });

  it('body 形状非法（缺键 / 非字符串 / 非 JSON）→ 400 明示', async () => {
    for (const bad of [{}, { contactEmail: 42 }, 'just-a-string']) {
      const res = await invokePatch(bad);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain('contactEmail');
    }
  });
});
