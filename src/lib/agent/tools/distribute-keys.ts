// M3-B-DELIVERY F006 — distribute_keys 工具（outbound/native，key 分发过闸门）
//
// class:'outbound'（对外·不可撤销：**一经发放不可回收**）→ 服务端强制停在确认前。
// PRD §15.3 M3 门要求「分发 key 未确认前不可执行」——闸门是重点，key 供应链不是（P8）。
//
// buildHarm 三要素：领取方（全名单不折叠）/ key 数量 / 「一经发放不可回收」红标。
// 执行（经两步票据后）：mock `KeyDistributor.distribute()`（零外呼，P1）→
// `GameKey reserved→distributed` + distributedAt + gateLogId（同一执行事务）→
// 交付条件 key 行置 met（本工具的执行就是该条件的证据）。
//
// key 来源 = **人工登记的 key 池**（`POST /api/delivery/deals/[id]/keys`，F008）：
// 本工具不生成 key、不采购、不对接平台；库存不足时明示拒绝，绝不「先发能发的」（P3 同源纪律）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { assertKeyRefNotPlaintext } from 'lib/delivery/key-ref';
import { getKeyDistributor } from 'lib/ops/partner';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

const inputSchema = z.object({
  dealId: z.string().min(1).describe('交易 Deal.id（key 从该交易的 key 池取）'),
  quantity: z
    .number()
    .int()
    .positive()
    .describe('本次发放数量（不足时服务端明示拒绝，不部分发放）'),
});

type DistributeKeysInput = z.infer<typeof inputSchema>;

interface DistributeKeysOutput {
  distributed: true;
  /** true = 幂等重入（同一闸门动作已发过，未重复发放）。 */
  already: boolean;
  dealId: string;
  recipient: string;
  quantity: number;
  /** 本次发放的 key 引用（**不是明文 key 值**，P8）。 */
  keyRefs: string[];
  /** true = mock KeyDistributor（未真实外呼，P1）。 */
  mocked: boolean;
}

/** 明示拒绝文案锚点（测试断言引用）。 */
export const KEYS_OUT_OF_STOCK_MSG =
  'key 池库存不足——拒绝部分发放（P3 明示拒绝不猜）';
export const KEYS_DEAL_NOT_FOUND_MSG = '交易不存在';
export const IRRECOVERABLE_NOTE = '一经发放不可回收';

interface ResolvedKeys {
  dealId: string;
  recipient: string;
  keyIds: string[];
  keyRefs: string[];
}

/**
 * 取库存（buildHarm 与 execute 共用——披露的 key 数量与实际发放的必须同源）。
 * 取 reserved 行，按 createdAt 升序（先登记先发，行为确定）。
 */
async function resolveKeys(
  input: DistributeKeysInput,
  ctx: ToolContext,
): Promise<ResolvedKeys> {
  const db = ctx.db ?? prisma;
  const deal = await db.deal.findFirst({
    where: { id: input.dealId, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      kol: { select: { displayName: true, handle: true, id: true } },
    },
  });
  if (!deal) {
    throw new Error(
      `[distribute_keys] ${KEYS_DEAL_NOT_FOUND_MSG}: ${input.dealId}`,
    );
  }
  if (deal.status === 'defaulted' || deal.status === 'blocked') {
    throw new Error(
      `[distribute_keys] 交易处于 ${deal.status}——拒绝发放（争议/违约未了结前不做不可逆动作）`,
    );
  }

  const available = await db.gameKey.findMany({
    where: { tenantId: ctx.tenantId, dealId: deal.id, status: 'reserved' },
    select: { id: true, keyRef: true },
    orderBy: { createdAt: 'asc' },
  });
  if (available.length < input.quantity) {
    throw new Error(
      `[distribute_keys] ${KEYS_OUT_OF_STOCK_MSG}：可用 ${available.length} 个，请求 ${input.quantity} 个。` +
        `请先在 key 池登记足量条目再发起。`,
    );
  }
  const picked = available.slice(0, input.quantity);
  // 防呆：明文 key 不该进库（F008 写入口已拦），分发前再核一次不把明文带进日志
  for (const k of picked) assertKeyRefNotPlaintext(k.keyRef);

  return {
    dealId: deal.id,
    recipient: deal.kol.displayName ?? deal.kol.handle ?? deal.kol.id,
    keyIds: picked.map((k) => k.id),
    keyRefs: picked.map((k) => k.keyRef),
  };
}

/** async buildHarm（§9.5）：领取方全名单不折叠 / key 数量 / 不可回收红标。 */
async function buildHarm(
  input: DistributeKeysInput,
  ctx: ToolContext,
): Promise<Harm> {
  const r = await resolveKeys(input, ctx);
  return {
    action: 'distribute_keys',
    summary: `向 ${r.recipient} 发放 ${r.keyRefs.length} 个游戏 key（${IRRECOVERABLE_NOTE}）`,
    targets: [r.recipient], // ① 领取方（全名单，不折叠）
    quantity: r.keyRefs.length, // ② key 数量
    irreversible: true, // ③ 不可回收（红标 label 同步）
    evidence: `key 引用：${r.keyRefs.join('、')}（存引用不存明文；${IRRECOVERABLE_NOTE}）`,
    expiresAt: new Date().toISOString(), // gate 会以其 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

async function run(
  input: DistributeKeysInput,
  ctx: ToolContext,
): Promise<DistributeKeysOutput> {
  const db = ctx.db ?? prisma;

  // ── 幂等重入（P6，幂等键 = PendingAction.id）：同一闸门动作已发放 → 不重复发 ──
  if (ctx.gateActionId) {
    const existing = await db.gameKey.findMany({
      where: {
        tenantId: ctx.tenantId,
        gateLogId: ctx.gateActionId,
        status: 'distributed',
      },
      select: { keyRef: true, dealId: true },
    });
    if (existing.length > 0) {
      const deal = await db.deal.findUnique({
        where: { id: existing[0].dealId },
        select: { kol: { select: { displayName: true, handle: true, id: true } } },
      });
      return {
        distributed: true,
        already: true,
        dealId: existing[0].dealId,
        recipient:
          deal?.kol.displayName ?? deal?.kol.handle ?? existing[0].dealId,
        quantity: existing.length,
        keyRefs: existing.map((k) => k.keyRef),
        mocked: true,
      };
    }
  }

  // 执行时刻复核库存（pending→confirm 窗口内 key 可能被别处发走）
  const r = await resolveKeys(input, ctx);

  // 外部副作用面（本批 = mock，零外呼）
  const result = await getKeyDistributor().distribute(
    {
      dealId: r.dealId,
      recipient: r.recipient,
      keyRefs: r.keyRefs,
      idempotencyKey: ctx.gateActionId ?? r.keyIds.join(','),
    },
    { tenantId: ctx.tenantId, db: ctx.db, agentId: ctx.agentId },
  );

  // GameKey reserved → distributed（条件写：并发下已被发走的行不会被二次翻牌）
  const flipped = await db.gameKey.updateMany({
    where: { id: { in: r.keyIds }, status: 'reserved' },
    data: {
      status: 'distributed',
      distributedAt: new Date(),
      gateLogId: ctx.gateActionId ?? null,
    },
  });
  if (flipped.count !== r.keyIds.length) {
    // 并发抢发 → 整体失败回滚（不留「发了一半」的账）
    throw new Error(
      `[distribute_keys] 并发冲突：预期翻牌 ${r.keyIds.length} 个，实际 ${flipped.count} 个——已回滚，请重新发起`,
    );
  }

  // 交付条件 key 行置 met：本工具的执行本身就是该条件的证据（不是替人「核验」）
  await db.deliverable.updateMany({
    where: { dealId: r.dealId, kind: 'key' },
    data: {
      status: 'met',
      evidenceRef: `keys:${r.keyRefs.join(',')}`,
      verifiedBy: ctx.agentId ?? 'delivery',
    },
  });

  return {
    distributed: true,
    already: false,
    dealId: r.dealId,
    recipient: r.recipient,
    quantity: r.keyRefs.length,
    keyRefs: r.keyRefs,
    mocked: result.mocked,
  };
}

export const distributeKeysTool: ToolDefinition<
  DistributeKeysInput,
  DistributeKeysOutput
> = {
  name: 'distribute_keys',
  description:
    '向创作者发放游戏 key（对外·不可撤销：一经发放不可回收）。这是 outbound 动作——服务端会强制停在你确认前，' +
    '确认卡如实列领取方、数量与不可回收提示。key 取自人工登记的 key 池，库存不足直接拒绝，不做部分发放。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
