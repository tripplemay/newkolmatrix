// M4.5-AGENT-LOOP F007 — 批量备好聚合确认面集成测试（多 pending 逐项链）
//
// 覆盖 acceptance：
// - 批量确认实现 = 循环调既有 /api/actions/[id]/confirm + /execute（**grep 证无新批量端点**）
// - 部分失败分项如实显示（成功 N / 失败 M + 各自原因原文，不归一成「操作失败」）
// - 聚合卡数据 = 服务端 harm 原样（targets 列全不折叠、irreversible 透传）
// - 空态诚实（无 pending → 占位文案，不假造）
// - 多 pending 逐项链真实走通：pending → confirm → execute，副作用逐个发生

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { aggregatePending } from '../../src/lib/agent/orchestrator';
import { toPendingBatchItems } from '../../src/lib/gate/pending-items';
import {
  confirmAndExecuteSequentially,
  type BatchPost,
} from '../../src/lib/gate/batch-confirm';
import {
  BATCH_DISCLOSURE_MSG,
  BATCH_EMPTY_MSG,
} from '../../src/components/common/PendingBatchCard';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m45-batch-${process.pid}`;

let tenantId: string;
let ctx: ToolContext;

/**
 * 传输注入：把 batch-confirm 的 URL 直接派到闸门服务层（与两个 route handler 同一实现），
 * 不起 HTTP。这样测的是**逐项两步票据链**本身，而不是 Next 的路由拼装。
 * 派发失败按端点同款错误信封返回（error/code），以验「原因原文透传」。
 */
const post: BatchPost = async (url, body) => {
  const m = url.match(/^\/api\/actions\/([^/]+)\/(confirm|execute)$/);
  if (!m) return { ok: false, status: 404, body: { error: '未知端点' } };
  const [, id, action] = m;
  try {
    if (action === 'confirm') {
      const r = await confirmPendingAction(id, ctx);
      return {
        ok: true,
        status: 200,
        body: r as unknown as Record<string, unknown>,
      };
    }
    const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
    const r = await executePendingAction(id, ticket, ctx);
    return {
      ok: true,
      status: 200,
      body: r as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return {
      ok: false,
      status: 400,
      body: { error: e.message ?? '失败', code: e.code ?? null },
    };
  }
};

/** 造一件 pending（quarterly 分享：harm 不读 DB，最轻的 outbound 夹具）。 */
async function makePending(): Promise<string> {
  const r = await executeTool('create_share_link', { scope: 'quarterly' }, ctx);
  expect(isPendingEnvelope(r.output)).toBe(true);
  return (r.output as { pendingActionId: string }).pendingActionId;
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 批量确认夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('🔒 无批量端点（不留绕过面）', () => {
  it('/api/actions 下只有只读列表与 [id]/{confirm,execute,reject}', () => {
    const entries = readdirSync('src/app/api/actions', { withFileTypes: true });
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['[id]', 'route.ts']);
    const sub = readdirSync('src/app/api/actions/[id]', {
      withFileTypes: true,
    })
      .map((e) => e.name)
      .sort();
    expect(sub).toEqual(['confirm', 'execute', 'reject', 'route.ts']);
  });

  it('全仓无 batch/bulk 确认端点（grep 证）', () => {
    let hits: string[] = [];
    try {
      hits = execFileSync(
        'git',
        [
          'grep',
          '-lEi',
          'api/actions/(batch|bulk)|batch-confirm/route|confirmAll',
          '--',
          'src',
        ],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter(Boolean);
    } catch {
      hits = [];
    }
    expect(hits, `发现疑似批量确认端点：\n${hits.join('\n')}`).toEqual([]);
  });

  it('执行器只调既有两个逐项端点（URL 形状钉死）', () => {
    const src = readFileSync('src/lib/gate/batch-confirm.ts', 'utf8');
    // 只看代码行——注释里把批量端点当反面教材点名是允许的
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).toContain('/api/actions/${id}/confirm');
    expect(code).toContain('/api/actions/${id}/execute');
    expect(code).not.toMatch(/api\/actions\/(batch|bulk)/);
  });
});

describe('多 pending 逐项链（真实两步票据）', () => {
  it('三件全部成功：逐项 confirm→execute，副作用逐个发生', async () => {
    const ids = [await makePending(), await makePending(), await makePending()];
    const before = await prisma.shareLink.count({ where: { tenantId } });

    const result = await confirmAndExecuteSequentially(ids, post);

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.items.map((i) => i.stage)).toEqual(['done', 'done', 'done']);
    // 每件各产生一次副作用（恰好一次，不多不少）
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      before + 3,
    );
    for (const id of ids) {
      const pa = await prisma.pendingAction.findUnique({ where: { id } });
      expect(pa!.status).toBe('executed');
    }
  });

  it('部分失败：失败项不中断后续项，且原因原文逐项保留', async () => {
    const good1 = await makePending();
    const bad = await makePending();
    const good2 = await makePending();
    // 让中间那件先被拒（confirm 会抛 GATE_ALREADY_DECIDED）
    await prisma.pendingAction.update({
      where: { id: bad },
      data: { status: 'rejected' },
    });

    const result = await confirmAndExecuteSequentially(
      [good1, bad, good2],
      post,
    );

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    const failed = result.items.find((i) => !i.ok)!;
    expect(failed.id).toBe(bad);
    expect(failed.stage).toBe('confirm');
    expect(failed.code).toBe('GATE_ALREADY_DECIDED');
    // 原因原文，不归一成「操作失败」
    expect(failed.error).toContain('该动作已处理');
    // 失败之后的项照常执行（不中断）
    expect(result.items[2]).toMatchObject({ id: good2, ok: true });
  });

  it('已确认过的动作重复批量 → 幂等失败如实回报，不重复副作用', async () => {
    const id = await makePending();
    const first = await confirmAndExecuteSequentially([id], post);
    expect(first.succeeded).toBe(1);
    const shareCount = await prisma.shareLink.count({ where: { tenantId } });

    const second = await confirmAndExecuteSequentially([id], post);
    expect(second.failed).toBe(1);
    expect(second.items[0].stage).toBe('confirm');
    expect(second.items[0].error).toBeTruthy();
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareCount,
    );
  });
});

describe('聚合卡数据面（harm 原样，不折叠）', () => {
  it('装配产物保留 targets 全名单 + irreversible + evidence（不摘要、不改写）', async () => {
    const id = await makePending();
    const items = toPendingBatchItems(await aggregatePending(ctx));
    const item = items.find((i) => i.id === id)!;
    expect(item.toolName).toBe('create_share_link');
    expect(item.harm).toBeTruthy();
    expect(item.harm!.targets.length).toBeGreaterThan(0);
    expect(item.harm!.irreversible).toBe(true);
    expect(item.harm!.evidence).toContain('链接一经生成即暴露');
    // JSON 往返无损（要经 RSC → client 边界）
    expect(JSON.parse(JSON.stringify(items))).toEqual(items);
  });

  it('harm 不可解析时如实置 null（不静默丢条目）', async () => {
    const items = toPendingBatchItems([
      {
        id: 'x',
        kind: 'gate',
        toolName: 'weird_tool',
        status: 'pending',
        harm: { nonsense: true },
        createdAt: new Date('2026-07-25T00:00:00.000Z'),
        projectId: null,
        agentId: 'reach',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].harm).toBeNull();
  });

  it('空态与批量语义文案锚点（不假造、不弱化）', () => {
    expect(BATCH_EMPTY_MSG).toContain('现在没有备好待确认的动作');
    expect(BATCH_DISCLOSURE_MSG).toContain('不是一键放行');
    expect(BATCH_DISCLOSURE_MSG).toContain('两步闸门');
  });
});
