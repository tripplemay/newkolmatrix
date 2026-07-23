// M3-A-REACH-CRM F009 — Evaluator 独立对抗探针（验收产物，Andy/evaluator-subagent）
//
// 与 reach-override.test.ts（Generator 交付）互补，覆盖其未触及的两层：
// 1. **HTTP route 层**「已确认」不可达（原测试只断言 schema 层；本探针直调 route handler
//    POST，断言 confirmed / 中文「已确认」/ 坏 JSON / 缺字段全部 400——均在 safeParse
//    失败即返回，不触 DB / dev tenant，验收后无需清态）
// 2. **STATUS_NOT_OVERRIDABLE 纵深**：绕过写入口注入 pending_send 降级断言 →
//    管道忽略 + 状态不动（原测试只覆盖 CONFIRMED_NOT_OVERRIDABLE 分支）
//
// 夹具租户按 pid 独立（test-tenant-m3a-*），CI / 本地并行安全。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { POST as overridePost } from '../../src/app/api/reach/override/route';
import { applyManualOverride } from '../../src/lib/reach/manual-override';
import { recomputeThreadStatus } from '../../src/lib/reach/recompute-status';

const FIXTURE_SLUG = `test-tenant-m3a-override-probe-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolId: string;

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/reach/override', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A override 评审探针夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'override 探针项目' },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-override-probe-kol-${process.pid}`,
      displayName: 'override 探针创作者',
    },
  });
  kolId = k.id;
});

afterAll(async () => {
  await prisma.signal.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 thread/message
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('HTTP route 层「已确认」不可达（400 拒绝路径不触 DB）', () => {
  it('status=confirmed → 400，错误文案明示须经报价闸门', async () => {
    const res = await overridePost(
      makeReq({ projectId: 'p', kolId: 'k', status: 'confirmed' }),
    );
    expect(res.status).toBe(400);
    const out = (await res.json()) as { error?: string };
    expect(out.error).toContain('已确认');
    expect(out.error).toContain('报价闸门');
  });

  it('中文「已确认」/ pending_send / 空串 / 缺 status → 全部 400', async () => {
    for (const status of ['已确认', 'pending_send', '', undefined]) {
      const res = await overridePost(
        makeReq({ projectId: 'p', kolId: 'k', status }),
      );
      expect(res.status).toBe(400);
    }
  });

  it('非 JSON body → 400（req.json() 失败回落 null → safeParse 拒绝）', async () => {
    const res = await overridePost(makeReq('not-json{{{'));
    expect(res.status).toBe(400);
  });
});

describe('STATUS_NOT_OVERRIDABLE 纵深（降级断言注入被忽略）', () => {
  it('合法覆盖 negotiating 后注入 pending_send 降级信号 → 管道忽略 + 状态不动', async () => {
    const r = await applyManualOverride(
      { projectId, kolId, status: 'negotiating' },
      { tenantId, actor: 'evaluator-probe' },
    );
    expect(r.to).toBe('negotiating');

    // 绕过写入口注入 U4 白名单外的合法五态（pending_send）——比 confirmed 更晚
    await prisma.signal.create({
      data: {
        tenantId,
        type: 'manual_override',
        source: 'user',
        externalId: `manual-probe-downgrade-${process.pid}`,
        threadId: r.threadId,
        payloadJson: { status: 'pending_send' },
        detectedAt: new Date(Date.now() + 1000),
      },
    });
    const rec = await recomputeThreadStatus(r.threadId, { tenantId });
    expect(rec.status).toBe('negotiating'); // 降级断言不生效
    expect(
      rec.infer.ignoredOverrides.some(
        (o) => o.reason === 'STATUS_NOT_OVERRIDABLE',
      ),
    ).toBe(true);

    const thread = await prisma.outreachThread.findUnique({
      where: { id: r.threadId },
    });
    expect(thread?.status).toBe('negotiating');
  });
});
