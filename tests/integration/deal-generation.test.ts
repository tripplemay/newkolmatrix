// M3-B-DELIVERY F003 — Deal 生成接线集成测试（打真库，走 commit_quote 两步票据全链）。
//
// 覆盖 acceptance：
// - commit_quote 执行后**同事务**落 Deal（projectId+kolId upsert 幂等）+ 五条 Deliverable
// - key 条件视 Quote.deliverables 是否含 key 交付 → required / na（P3）
// - termsJson 含金额/币种/交付物/范围快照
// - 幂等重入不重复建（Deal 一行 / 条件仍五条）
// - 「有 committed quote 必有 Deal」（→delivery 守卫判据 :488 的数据前提）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  ensureDealForQuote,
  type EnsureDealInput,
} from '../../src/lib/delivery/ensure-deal';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3b-deal-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolPlain: string; // 无 key 交付
let kolWithKey: string; // 含 key 交付
let ctx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B deal 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B deal 夹具项目' },
  });
  projectId = p.id;
  const k1 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-deal-plain-${process.pid}`,
      displayName: 'PlainStreamer',
    },
  });
  kolPlain = k1.id;
  const k2 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-deal-key-${process.pid}`,
      displayName: 'KeyStreamer',
    },
  });
  kolWithKey = k2.id;
  ctx = { tenantId, agentId: 'reach', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 thread/quote/deal/deliverable
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** 走完整两步票据链：executeTool → pending 信封 → confirm 签票 → execute 消费票。 */
async function commitQuoteThroughGate(input: {
  kolId: string;
  amount: number;
  deliverables: string[];
  scope?: string;
}) {
  const r = await executeTool(
    'commit_quote',
    {
      projectId,
      kolId: input.kolId,
      amount: input.amount,
      currency: 'USD',
      deliverables: input.deliverables,
      scope: input.scope,
    },
    ctx,
  );
  if (!isPendingEnvelope(r.output)) {
    throw new Error('commit_quote 未停在闸门（outbound 必须先 pending）');
  }
  const paId = r.output.pendingActionId;
  const conf = await confirmPendingAction(paId, ctx);
  const exec = await executePendingAction(paId, conf.ticket, ctx);
  return {
    paId,
    exec,
    output: exec.output as { dealId: string; dealCreated: boolean },
  };
}

describe('commit_quote → Deal 生成（P2 唯一新增接线点）', () => {
  it('闸门前零副作用：Deal 未产生（pending 阶段不落交付域数据）', async () => {
    const r = await executeTool(
      'commit_quote',
      {
        projectId,
        kolId: kolPlain,
        amount: 1200,
        currency: 'USD',
        deliverables: ['1 条长视频'],
      },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    expect(await prisma.deal.count({ where: { tenantId } })).toBe(0);
    // 清掉这条 pending，避免与后续用例的闸门动作混淆
    await prisma.pendingAction.deleteMany({ where: { tenantId } });
  });

  it('执行后：Deal(negotiating) + 五条件行在场，termsJson 是报价快照', async () => {
    const { output } = await commitQuoteThroughGate({
      kolId: kolPlain,
      amount: 1600,
      deliverables: ['1 条长视频', '2 条 shorts'],
      scope: '项目内使用 90 天',
    });
    expect(output.dealCreated).toBe(true);

    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolPlain } },
      include: { deliverables: true },
    });
    expect(deal).not.toBeNull();
    expect(deal?.id).toBe(output.dealId);
    expect(deal?.status).toBe('negotiating'); // 初态（P2）
    expect(deal?.tenantId).toBe(tenantId);

    // 「有 committed quote 必有 Deal」：quoteId 指回本次报价
    const quote = await prisma.quote.findFirst({
      where: { tenantId, status: 'committed' },
    });
    expect(deal?.quoteId).toBe(quote?.id);

    const terms = deal?.termsJson as {
      amount: number;
      currency: string;
      deliverables: string[];
      scope: string | null;
    };
    expect(terms.amount).toBe(1600);
    expect(terms.currency).toBe('USD');
    expect(terms.deliverables).toEqual(['1 条长视频', '2 条 shorts']);
    expect(terms.scope).toBe('项目内使用 90 天');

    // 五条件行（P3）
    expect(deal?.deliverables).toHaveLength(5);
    const byKind = Object.fromEntries(
      (deal?.deliverables ?? []).map((d) => [d.kind, d]),
    );
    for (const kind of ['content', 'contract', 'escrow', 'ad_disclosure']) {
      expect(byKind[kind].required).toBe(true);
      expect(byKind[kind].status).toBe('pending');
    }
    // 报价未含 key 交付 → 不适用（不是「缺」）
    expect(byKind.key.required).toBe(false);
    expect(byKind.key.status).toBe('na');
  });

  it('含 key 交付的报价 → key 条件 required=true + pending（P3）', async () => {
    await commitQuoteThroughGate({
      kolId: kolWithKey,
      amount: 900,
      deliverables: ['Boss 速通短视频', '20 个 Steam key 分发'],
    });
    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolWithKey } },
      include: { deliverables: true },
    });
    const key = deal?.deliverables.find((d) => d.kind === 'key');
    expect(key?.required).toBe(true);
    expect(key?.status).toBe('pending');
  });

  it('Deal 生成写 OperationLog 留痕（kind=auto，带 dealId 载荷）', async () => {
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'auto', projectId },
      orderBy: { createdAt: 'desc' },
      // 取最新一条 auto 日志：交易生成或状态推进，两者都应带 payload
    });
    const dealLogs = await prisma.operationLog.findMany({
      where: { tenantId, kind: 'auto', projectId },
    });
    expect(log).not.toBeNull();
    const created = dealLogs.filter((l) =>
      (l.summary ?? '').includes('交易生成'),
    );
    expect(created.length).toBe(2); // 两个 KOL 各一条
    const payload = created[0].payloadJson as { dealId?: string };
    expect(payload.dealId).toBeTruthy();
  });
});

describe('幂等：重入不重复建', () => {
  it('同一 KOL 再次经闸门承诺报价 → Deal 仍一行、条件仍五条', async () => {
    const before = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolPlain } },
    });
    const { output } = await commitQuoteThroughGate({
      kolId: kolPlain,
      amount: 1800,
      deliverables: ['1 条长视频', '追加 1 条 shorts'],
    });
    expect(output.dealCreated).toBe(false); // 命中既有 Deal
    expect(output.dealId).toBe(before?.id);

    const deals = await prisma.deal.findMany({
      where: { tenantId, projectId, kolId: kolPlain },
      include: { deliverables: true },
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].deliverables).toHaveLength(5);
    // 仍在 negotiating → 条款快照刷新为最新报价
    const terms = deals[0].termsJson as { amount: number };
    expect(terms.amount).toBe(1800);
  });

  it('服务层直调重入（同 quote 连调两次）→ 不重复建 Deal / 不重复插条件行', async () => {
    const quote = await prisma.quote.findFirst({
      where: { tenantId, status: 'committed' },
      select: { id: true },
    });
    const args: EnsureDealInput = {
      projectId,
      kolId: kolPlain,
      quoteId: quote!.id,
      amount: 1800,
      currency: 'USD',
      deliverables: ['1 条长视频'],
      scope: null,
    };
    const a = await ensureDealForQuote(args, { tenantId });
    const b = await ensureDealForQuote(args, { tenantId });
    expect(a.created).toBe(false);
    expect(b.created).toBe(false);
    expect(b.deliverablesCreated).toBe(0);
    expect(
      await prisma.deliverable.count({ where: { dealId: a.dealId } }),
    ).toBe(5);
  });

  it('缺行自愈：手工删掉一条条件行后重入 → 补回且不覆盖其它行的人工核验', async () => {
    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolPlain } },
      select: { id: true },
    });
    // 人工核验过的行（不得被重入覆盖）
    await prisma.deliverable.updateMany({
      where: { dealId: deal!.id, kind: 'contract' },
      data: { status: 'met', evidenceRef: 'sign-9001', verifiedBy: 'operator' },
    });
    await prisma.deliverable.deleteMany({
      where: { dealId: deal!.id, kind: 'escrow' },
    });

    const r = await ensureDealForQuote(
      {
        projectId,
        kolId: kolPlain,
        quoteId: 'quote-refresh',
        amount: 1800,
        currency: 'USD',
        deliverables: ['1 条长视频'],
      },
      { tenantId },
    );
    expect(r.created).toBe(false);
    expect(r.deliverablesCreated).toBe(1); // 只补回 escrow

    const rows = await prisma.deliverable.findMany({
      where: { dealId: deal!.id },
    });
    expect(rows).toHaveLength(5);
    const contract = rows.find((d) => d.kind === 'contract');
    expect(contract?.status).toBe('met'); // 人工核验结果原样保留
    expect(contract?.evidenceRef).toBe('sign-9001');
  });

  it('已推进的 Deal（非 negotiating）条款不被新报价静默改写（P2 审计口径）', async () => {
    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolWithKey } },
      select: { id: true },
    });
    await prisma.deal.update({
      where: { id: deal!.id },
      data: { status: 'signed' },
    });
    const r = await ensureDealForQuote(
      {
        projectId,
        kolId: kolWithKey,
        quoteId: 'quote-after-signed',
        amount: 99999,
        currency: 'USD',
        deliverables: ['改口的交付物'],
      },
      { tenantId },
    );
    expect(r.termsRefreshed).toBe(false);
    const after = await prisma.deal.findUnique({ where: { id: deal!.id } });
    const terms = after?.termsJson as { amount: number };
    expect(terms.amount).toBe(900); // 仍是签约时的条款
    expect(after?.status).toBe('signed');
  });
});
