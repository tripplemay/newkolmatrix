// M3-B-DELIVERY F003 — **Evaluator 独立验收测试**（不复用 Generator 的断言表）。
//
// 独立性口径：合法边表由本文件从 spec §5 F003 acceptance 文本 + P2/P3 决策独立重新推导，
// 不 import 实现里的 DEAL_FLOW_ORDER / LEGAL_EDGES；集成侧另建夹具租户，不共用
// tests/integration/deal-generation.test.ts 的数据与用例。
//
// 覆盖 acceptance 五项：
//  ① commit_quote 执行后**同事务**落 Deal（含真回滚取证：事务抛错 → Deal 不留存）
//  ② 五条 Deliverable（四类 required=true/pending；key 视报价含 key 交付 → required|na）
//  ③ termsJson 含金额/币种/交付物/范围快照
//  ④ dealAdvance 合法流转 + 非法拒绝（7×7 独立矩阵）
//  ⑤ 幂等重入不重复建（gateActionId 重入分支 + 服务层重入）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { commitQuoteTool } from '../../src/lib/agent/tools/commit-quote';
import {
  ensureDealForQuote,
  type EnsureDealInput,
} from '../../src/lib/delivery/ensure-deal';
import { dealAdvance } from '../../src/lib/domain/deal-advance';
import {
  planDeliverables,
  includesKeyDelivery,
} from '../../src/lib/domain/deliverable-plan';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m3b-eval-f003-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolA: string; // 无 key 交付
let kolB: string; // 含 key 交付
let kolC: string; // 回滚取证专用
let ctx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: 'M3B F003 evaluator 夹具' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B F003 evaluator 项目' },
  });
  projectId = p.id;
  const mk = async (h: string, n: string) =>
    (
      await prisma.kol.create({
        data: { tenantId, canonicalHandle: h, displayName: n },
      })
    ).id;
  kolA = await mk(`m3b-eval-a-${process.pid}`, 'EvalPlain');
  kolB = await mk(`m3b-eval-b-${process.pid}`, 'EvalKey');
  kolC = await mk(`m3b-eval-c-${process.pid}`, 'EvalRollback');
  ctx = { tenantId, agentId: 'reach', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

async function throughGate(input: {
  kolId: string;
  amount: number;
  currency?: string;
  deliverables: string[];
  scope?: string;
}) {
  const r = await executeTool(
    'commit_quote',
    {
      projectId,
      kolId: input.kolId,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      deliverables: input.deliverables,
      scope: input.scope,
    },
    ctx,
  );
  if (!isPendingEnvelope(r.output)) throw new Error('outbound 未停在闸门');
  const paId = r.output.pendingActionId;
  const conf = await confirmPendingAction(paId, ctx);
  const exec = await executePendingAction(paId, conf.ticket, ctx);
  return {
    paId,
    output: exec.output as { dealId: string; dealCreated: boolean },
  };
}

/* ── ① 同事务：真回滚取证 ─────────────────────────────────────────
   若 ensureDealForQuote 内部用全局 prisma 而非 ctx.db，写入会逃出调用方事务，
   回滚后 Deal 仍在 —— 本用例就是那条缝的探针。 */
describe('① 同事务落库（回滚取证）', () => {
  it('调用方事务抛错 → Deal / Deliverable / OperationLog 一并回滚，零残留', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const r = await ensureDealForQuote(
          {
            projectId,
            kolId: kolC,
            quoteId: 'q-rollback-probe',
            amount: 777,
            currency: 'USD',
            deliverables: ['1 条长视频'],
            scope: null,
          },
          { tenantId, db: tx, actor: 'reach' },
        );
        expect(r.created).toBe(true);
        // 事务内可见
        expect(await tx.deal.count({ where: { tenantId, kolId: kolC } })).toBe(
          1,
        );
        throw new Error('rollback-probe');
      }),
    ).rejects.toThrow('rollback-probe');

    expect(await prisma.deal.count({ where: { tenantId, kolId: kolC } })).toBe(
      0,
    );
    expect(
      await prisma.deliverable.count({
        where: { tenantId, deal: { kolId: kolC } },
      }),
    ).toBe(0);
    expect(
      await prisma.operationLog.count({
        where: { tenantId, payloadJson: { path: ['kolId'], equals: kolC } },
      }),
    ).toBe(0);
  });

  it('闸门前（pending 未确认）零副作用：Deal / 交付条件 / 交易生成留痕均为零', async () => {
    const before = await prisma.deal.count({ where: { tenantId } });
    const r = await executeTool(
      'commit_quote',
      {
        projectId,
        kolId: kolA,
        amount: 500,
        currency: 'USD',
        deliverables: ['1 条长视频'],
      },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    expect(await prisma.deal.count({ where: { tenantId } })).toBe(before);
    expect(await prisma.deliverable.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.operationLog.count({
        where: { tenantId, summary: { contains: '交易生成' } },
      }),
    ).toBe(0);
    await prisma.pendingAction.deleteMany({ where: { tenantId } });
  });
});

/* ── ②③ 全链落库 + 快照 ─────────────────────────────────────── */
describe('②③ commit_quote 全链 → Deal + 五条件 + termsJson 快照', () => {
  it('执行后 Deal(negotiating) 指回 committed Quote，五条件语义正确', async () => {
    const { output } = await throughGate({
      kolId: kolA,
      amount: 2400.5,
      currency: 'EUR',
      deliverables: ['1 条长视频', '2 条 shorts'],
      scope: '全渠道 180 天',
    });
    expect(output.dealCreated).toBe(true);

    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolA } },
      include: { deliverables: true },
    });
    expect(deal).not.toBeNull();
    expect(deal!.status).toBe('negotiating');
    expect(deal!.tenantId).toBe(tenantId);
    expect(deal!.contractRef).toBeNull();
    expect(deal!.escrowRef).toBeNull();

    const quote = await prisma.quote.findFirst({
      where: { tenantId, status: 'committed' },
      select: { id: true, gateLogId: true },
    });
    expect(deal!.quoteId).toBe(quote!.id);
    expect(quote!.gateLogId).toBeTruthy(); // committed 必经闸门

    // termsJson 四项快照
    const terms = deal!.termsJson as Record<string, unknown>;
    expect(terms.amount).toBe(2400.5);
    expect(terms.currency).toBe('EUR');
    expect(terms.deliverables).toEqual(['1 条长视频', '2 条 shorts']);
    expect(terms.scope).toBe('全渠道 180 天');
    expect(typeof terms.snapshotAt).toBe('string');

    // 五条件行：kind 恰好五值互不重复
    expect(deal!.deliverables).toHaveLength(5);
    expect(new Set(deal!.deliverables.map((d) => d.kind))).toEqual(
      new Set(['content', 'key', 'contract', 'escrow', 'ad_disclosure']),
    );
    for (const d of deal!.deliverables) {
      expect(d.tenantId).toBe(tenantId);
      expect(d.dealId).toBe(deal!.id);
      expect(d.evidenceRef).toBeNull();
      expect(d.verifiedBy).toBeNull();
      if (d.kind === 'key') {
        expect(d.required).toBe(false);
        expect(d.status).toBe('na'); // 三态诚实：不适用 ≠ 缺
      } else {
        expect(d.required).toBe(true);
        expect(d.status).toBe('pending');
      }
    }

    // 生成 Deal 不顺带产生任何资金/发放行（P1：本条 feature 零资金动作）
    expect(await prisma.payout.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.gameKey.count({ where: { tenantId } })).toBe(0);
  });

  it('报价含 key 交付 → key 条件 required=true + pending（P3 分支）', async () => {
    await throughGate({
      kolId: kolB,
      amount: 300,
      deliverables: ['1 条实况', '50 个 Steam key'],
    });
    const rows = await prisma.deliverable.findMany({
      where: { deal: { projectId, kolId: kolB } },
    });
    const key = rows.find((d) => d.kind === 'key');
    expect(key!.required).toBe(true);
    expect(key!.status).toBe('pending');
  });

  it('「有 committed quote 必有 Deal」：夹具租户内不存在孤儿 committed 报价', async () => {
    const committed = await prisma.quote.findMany({
      where: { tenantId, status: 'committed' },
      select: { thread: { select: { projectId: true, kolId: true } } },
    });
    expect(committed.length).toBeGreaterThan(0);
    for (const q of committed) {
      const deal = await prisma.deal.findUnique({
        where: {
          projectId_kolId: {
            projectId: q.thread.projectId,
            kolId: q.thread.kolId,
          },
        },
        select: { id: true },
      });
      expect(deal).not.toBeNull();
    }
  });
});

/* ── ⑤ 幂等 ─────────────────────────────────────────────────── */
describe('⑤ 幂等重入不重复建', () => {
  it('同一 gateActionId 重入（crash 重放分支）→ 不新建 Quote、不新建 Deal', async () => {
    const { paId } = await throughGate({
      kolId: kolA,
      amount: 2600,
      deliverables: ['1 条长视频'],
    });
    const quotesBefore = await prisma.quote.count({ where: { tenantId } });
    const dealsBefore = await prisma.deal.count({ where: { tenantId } });

    const out = (await commitQuoteTool.execute(
      {
        projectId,
        kolId: kolA,
        amount: 2600,
        currency: 'USD',
        deliverables: ['1 条长视频'],
      },
      { ...ctx, gateActionId: paId },
    )) as { dealCreated: boolean; dealId: string };

    expect(out.dealCreated).toBe(false);
    expect(await prisma.quote.count({ where: { tenantId } })).toBe(
      quotesBefore,
    );
    expect(await prisma.deal.count({ where: { tenantId } })).toBe(dealsBefore);
    expect(
      await prisma.deliverable.count({ where: { dealId: out.dealId } }),
    ).toBe(5);
  });

  it('服务层连调三次 → Deal 一行、条件恒五条', async () => {
    const args: EnsureDealInput = {
      projectId,
      kolId: kolA,
      quoteId: 'q-idem',
      amount: 2600,
      currency: 'USD',
      deliverables: ['1 条长视频'],
      scope: null,
    };
    for (let i = 0; i < 3; i++) {
      const r = await ensureDealForQuote(args, { tenantId });
      expect(r.created).toBe(false);
      expect(r.deliverablesCreated).toBe(0);
    }
    const deals = await prisma.deal.findMany({
      where: { tenantId, projectId, kolId: kolA },
      include: { deliverables: true },
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].deliverables).toHaveLength(5);
  });

  it('人工核验结果不被重入覆盖（met + evidenceRef 原样保留）', async () => {
    const deal = await prisma.deal.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolA } },
      select: { id: true },
    });
    await prisma.deliverable.updateMany({
      where: { dealId: deal!.id, kind: 'content' },
      data: { status: 'met', evidenceRef: 'v-777', verifiedBy: 'operator' },
    });
    await ensureDealForQuote(
      {
        projectId,
        kolId: kolA,
        quoteId: 'q-idem-2',
        amount: 2600,
        currency: 'USD',
        deliverables: ['1 条长视频'],
        scope: null,
      },
      { tenantId },
    );
    const row = await prisma.deliverable.findFirst({
      where: { dealId: deal!.id, kind: 'content' },
    });
    expect(row!.status).toBe('met');
    expect(row!.evidenceRef).toBe('v-777');
    expect(row!.verifiedBy).toBe('operator');
  });
});

/* ── ④ dealAdvance 独立 7×7 矩阵（合法边表从 spec 文本独立推导）────── */
describe('④ dealAdvance 状态机（Evaluator 独立推导的合法边表）', () => {
  const STATES = [
    'negotiating',
    'signed',
    'escrowed',
    'delivering',
    'completed',
    'blocked',
    'defaulted',
  ] as const;
  type S = (typeof STATES)[number];
  const MAINLINE: S[] = [
    'negotiating',
    'signed',
    'escrowed',
    'delivering',
    'completed',
  ];
  const RUNNING: S[] = ['negotiating', 'signed', 'escrowed', 'delivering'];

  /** spec：主线相邻推进 · 运行态可 blocked（可恢复）· 未完成可 defaulted（终态）· 终态无出边 */
  function expectLegal(from: S, to: S): boolean {
    if (from === to) return false;
    if (from === 'completed' || from === 'defaulted') return false;
    if (to === 'defaulted') return true;
    if (to === 'blocked') return RUNNING.includes(from);
    if (from === 'blocked') return RUNNING.includes(to); // 恢复后须重走主线
    const fi = MAINLINE.indexOf(from);
    const ti = MAINLINE.indexOf(to);
    return fi >= 0 && ti === fi + 1;
  }

  for (const from of STATES) {
    for (const to of STATES) {
      it(`${from} → ${to} 期望${
        expectLegal(from, to) ? '放行' : '拒绝'
      }`, () => {
        expect(dealAdvance(from, to).allowed).toBe(expectLegal(from, to));
      });
    }
  }

  it('拒绝码可分支（调用方据此提示/留痕，不靠自由文本）', () => {
    expect(dealAdvance('negotiating', 'completed').reason).toBe(
      'SKIPPED_STAGE',
    );
    expect(dealAdvance('delivering', 'signed').reason).toBe('BACKWARD');
    expect(dealAdvance('completed', 'defaulted').reason).toBe('TERMINAL_STATE');
    expect(dealAdvance('defaulted', 'delivering').reason).toBe(
      'TERMINAL_STATE',
    );
    expect(dealAdvance('blocked', 'completed').reason).toBe(
      'ILLEGAL_TRANSITION',
    );
    expect(dealAdvance('signed', 'signed').reason).toBe('SAME_STATE');
  });

  it('脏值 / 空值不抛错也不放行（外部数据不可信）', () => {
    for (const bad of ['', ' ', 'SIGNED', 'paid', 'null', '1']) {
      expect(() => dealAdvance('signed', bad)).not.toThrow();
      expect(dealAdvance('signed', bad).allowed).toBe(false);
      expect(dealAdvance(bad, 'signed').allowed).toBe(false);
    }
    expect(dealAdvance(undefined as unknown as string, 'signed').allowed).toBe(
      false,
    );
    expect(dealAdvance('signed', null as unknown as string).allowed).toBe(
      false,
    );
  });

  it('纯函数：无副作用、同输入同输出、每次新对象', () => {
    const a = dealAdvance('escrowed', 'delivering');
    const b = dealAdvance('escrowed', 'delivering');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(Object.isFrozen(a)).toBe(false); // 只断言"新对象"，不要求冻结
  });
});

/* ── P3 词表边界（含误判方向取证）─────────────────────────────── */
describe('planDeliverables 词表边界', () => {
  it('恒五条；四类恒必需；无 key 交付 → na 不阻断', () => {
    const plan = planDeliverables(['1 条长视频']);
    expect(plan).toHaveLength(5);
    expect(plan.filter((p) => p.required)).toHaveLength(4);
    expect(plan.find((p) => p.kind === 'key')).toEqual({
      kind: 'key',
      required: false,
      status: 'na',
    });
  });

  it('真 key 交付识别（中英 + 变体）', () => {
    for (const s of [
      'Steam key ×10',
      'cd-key 一批',
      '游戏激活码',
      '兑换码',
      '序列号',
      '密钥若干',
      'game keys',
    ]) {
      expect(includesKeyDelivery([s]), s).toBe(true);
    }
  });

  it('词边界：monkey / keyboard / turnkey / Turkey 不误判', () => {
    for (const s of [
      'monkey 实况',
      'keyboard 开箱',
      'turnkey 方案介绍',
      'Turkey 地区直播',
    ]) {
      expect(includesKeyDelivery([s]), s).toBe(false);
    }
  });

  // 取证（非阻断）：营销语境的「key visual / key opinion」会被判成 key 交付，
  // 方向是**多要一个条件**（拦住放款），不是少要 —— 失败安全，且 F008 可人工改回。
  it('[取证] 营销术语 key visual / key opinion 会被判为 key 交付（fail-safe 方向）', () => {
    expect(includesKeyDelivery(['1 张 key visual 主视觉'])).toBe(true);
    expect(includesKeyDelivery(['Key Opinion Leader 专属内容'])).toBe(true);
  });

  it('空 / null / 非字符串项不抛错', () => {
    expect(includesKeyDelivery([])).toBe(false);
    expect(includesKeyDelivery(null)).toBe(false);
    expect(includesKeyDelivery(undefined)).toBe(false);
    expect(includesKeyDelivery([null, 123, {}] as unknown as string[])).toBe(
      false,
    );
  });
});
