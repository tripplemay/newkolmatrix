// M3-B-DELIVERY F007 — delivery 内部工具集成测试（track_delivery / check_deliverables）
//
// 覆盖 acceptance：
// - 两工具注册 + 挂 delivery 人格（人格声明的每个工具名真实存在于注册表——同源断言）
// - class=internal 且**无 buildHarm**（只读不过闸门）：直调不产生 PendingAction
// - check_deliverables 输出 = deliveryCheck 产物（与纯函数直算逐字相等——不内联重算）
// - track_delivery 返回 Deal + 条件快照且**可序列化**（JSON 往返无损，供画布渲染）
// - 输入契约（zod）：坏入参被拒

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { checkDeliveryRow } from '../../src/lib/domain/delivery-check';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type {
  CheckDeliverablesOutput,
  TrackDeliveryOutput,
} from '../../src/lib/agent/tools/delivery-tracking';

const FIXTURE_SLUG = `test-tenant-m3b-tools-${process.pid}`;

let tenantId: string;
let projectId: string;
let otherProjectId: string;
let readyDealId: string;
let gapDealId: string;
let ctx: ToolContext;

async function makeDeal(opts: {
  handle: string;
  project: string;
  ready: boolean;
}): Promise<string> {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `${opts.handle}-${process.pid}`,
      displayName: opts.handle,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId,
      projectId: opts.project,
      kolId: kol.id,
      status: 'delivering',
      termsJson: {
        amount: 1400,
        currency: 'USD',
        deliverables: ['愿望单导流视频'],
        scope: '项目内 90 天',
      } as unknown as Prisma.InputJsonValue,
      contractRef: opts.ready ? 'sign-1' : null,
      escrowRef: 'esc-1',
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'met' },
          { tenantId, kind: 'key', required: false, status: 'na' },
          {
            tenantId,
            kind: 'contract',
            required: true,
            status: opts.ready ? 'met' : 'missing',
            note: opts.ready ? null : '合同待补签',
          },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          { tenantId, kind: 'ad_disclosure', required: true, status: 'met' },
        ],
      },
    },
  });
  return deal.id;
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B delivery-tools 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B tools 夹具项目' },
  });
  projectId = p.id;
  const other = await prisma.project.create({
    data: { tenantId, name: 'M3B tools 他项目' },
  });
  otherProjectId = other.id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };

  readyDealId = await makeDeal({
    handle: 'ToolsReady',
    project: projectId,
    ready: true,
  });
  gapDealId = await makeDeal({
    handle: 'ToolsGap',
    project: projectId,
    ready: false,
  });
  await makeDeal({ handle: 'ToolsOther', project: otherProjectId, ready: true });
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与契约', () => {
  it('两工具已注册、class=internal、无 buildHarm（只读不过闸门）', () => {
    for (const name of ['track_delivery', 'check_deliverables']) {
      const tool = getTool(name);
      expect(tool, name).toBeTruthy();
      expect(tool?.class).toBe('internal');
      expect(tool?.buildHarm).toBeUndefined();
    }
  });

  it('delivery 人格声明的每个工具名真实存在于注册表（同源断言）', () => {
    const delivery = listPersonas().find((p) => p.id === 'delivery');
    expect(delivery?.tools).toEqual(
      expect.arrayContaining([
        'track_delivery',
        'check_deliverables',
        'payout',
        'distribute_keys',
      ]),
    );
    for (const name of delivery?.tools ?? []) {
      expect(getTool(name), `人格声明的工具 ${name} 不在注册表`).toBeTruthy();
    }
  });

  it('internal 直调不产生 PendingAction（不过闸门）', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await executeTool('track_delivery', { projectId }, ctx);
    await executeTool('check_deliverables', { dealId: readyDealId }, ctx);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });

  it('输入契约：坏入参被 zod 拒（空 id / 缺字段）', async () => {
    await expect(
      executeTool('check_deliverables', { dealId: '' }, ctx),
    ).rejects.toThrowError();
    await expect(executeTool('track_delivery', {}, ctx)).rejects.toThrowError();
  });
});

describe('check_deliverables = deliveryCheck 产物（三处复用铁律 ②）', () => {
  it('输出的 conditions/ready/gaps 与纯函数直算逐字相等（不内联重算）', async () => {
    const r = await executeTool(
      'check_deliverables',
      { dealId: gapDealId },
      ctx,
    );
    const out = r.output as CheckDeliverablesOutput;
    expect(out.found).toBe(true);

    // 直接用 domain 纯函数按库内事实复算一遍，逐字比对
    const rows = await prisma.deliverable.findMany({
      where: { dealId: gapDealId },
    });
    const deal = await prisma.deal.findUnique({ where: { id: gapDealId } });
    const expected = checkDeliveryRow({
      deal: { id: gapDealId, status: deal!.status as never },
      deliverables: rows.map((d) => ({
        kind: d.kind as never,
        status: d.status as never,
        required: d.required,
        evidenceRef: d.evidenceRef,
        note: d.note,
      })),
    });
    expect(out.row?.conditions).toEqual(expected.conditions);
    expect(out.row?.ready).toBe(expected.ready);
    expect(out.row?.gaps).toEqual(expected.gaps);
  });

  it('缺口带人类可读摘要（「缺什么显什么」与拒绝原因同一套文案）', async () => {
    const r = await executeTool(
      'check_deliverables',
      { dealId: gapDealId },
      ctx,
    );
    const out = r.output as CheckDeliverablesOutput;
    expect(out.row?.ready).toBe(false);
    expect(out.row?.gapSummary).toContain('合同 缺');
  });

  it('条件全齐 → ready=true 且 gaps 空；na 与 miss 三态可分辨', async () => {
    const r = await executeTool(
      'check_deliverables',
      { dealId: readyDealId },
      ctx,
    );
    const out = r.output as CheckDeliverablesOutput;
    expect(out.row?.ready).toBe(true);
    expect(out.row?.gaps).toEqual([]);
    const cells = Object.fromEntries(
      (out.row?.conditions ?? []).map((c) => [c.kind, c.cell]),
    );
    expect(cells.key).toBe('na'); // 无 key 交付 = 不适用
    expect(cells.content).toBe('ok');
  });

  it('不存在的 Deal → found=false（不抛错，调用方自行决定提示）', async () => {
    const r = await executeTool('check_deliverables', { dealId: 'nope' }, ctx);
    expect((r.output as CheckDeliverablesOutput).found).toBe(false);
  });
});

describe('track_delivery 返回 Deal + 条件快照', () => {
  it('按项目返回全部交易，含 ready 计数', async () => {
    const r = await executeTool('track_delivery', { projectId }, ctx);
    const out = r.output as TrackDeliveryOutput;
    expect(out.total).toBe(2);
    expect(out.readyCount).toBe(1);
    expect(out.rows.map((x) => x.who).sort()).toEqual([
      'ToolsGap',
      'ToolsReady',
    ]);
    const row = out.rows.find((x) => x.dealId === readyDealId);
    expect(row?.amount).toBe(1400);
    expect(row?.currency).toBe('USD');
    expect(row?.dealStatus).toBe('delivering');
    expect(row?.contractRef).toBe('sign-1');
    expect(row?.conditions).toHaveLength(5);
  });

  it('产物可序列化（JSON 往返无损，供画布渲染）', async () => {
    const r = await executeTool('track_delivery', { projectId }, ctx);
    const out = r.output as TrackDeliveryOutput;
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('dealId 收窄到单笔；跨项目 dealId 不泄漏（按无此交易处理）', async () => {
    const one = (
      await executeTool(
        'track_delivery',
        { projectId, dealId: gapDealId },
        ctx,
      )
    ).output as TrackDeliveryOutput;
    expect(one.total).toBe(1);
    expect(one.rows[0].dealId).toBe(gapDealId);

    const cross = (
      await executeTool(
        'track_delivery',
        { projectId: otherProjectId, dealId: gapDealId },
        ctx,
      )
    ).output as TrackDeliveryOutput;
    expect(cross.total).toBe(0);
  });

  it('零交易项目 → 空数组不报错（空态诚实）', async () => {
    const empty = await prisma.project.create({
      data: { tenantId, name: '零交易项目' },
    });
    const out = (
      await executeTool('track_delivery', { projectId: empty.id }, ctx)
    ).output as TrackDeliveryOutput;
    expect(out.total).toBe(0);
    expect(out.readyCount).toBe(0);
    expect(out.rows).toEqual([]);
  });
});
