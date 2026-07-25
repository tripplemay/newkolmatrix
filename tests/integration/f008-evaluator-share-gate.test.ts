// M4-INSIGHT F008 — **Evaluator 独立验收探针**（不替代 Generator 回归测试，作交叉验证）
//
// 目的：不复用 Generator 断言的措辞，用另一条路径独立取证 acceptance 关键项：
//  E1 真打库证明：经 $queryRaw 原生 SQL 读回落库行（排除任何 ORM/内存桩的可能）
//  E2 运行时零外呼：全链路劫持 globalThis.fetch → 一次调用即失败（P4 零真实公开暴露的运行时证据）
//  E3 明文 token 全库扫描：ShareLink 全列 + PendingAction.inputJson/harmJson + OperationLog 全文
//  E4 闸门不可绕过：模型侧入参夹带 confirmationToken / gateActionId 仍只能拿 pending（zod 剥离未知键）
//  E5 harm 披露口径真实：expiresAt 被 gate 以确认窗 TTL 覆盖（非工具里的 now），三要素在场
//  E6 并发双消费同一票 → 只建一行（幂等键 = PendingAction.id 的强化断言）
//  E7 正向控制（assertion liveness）：irrev / marker 查询在成功路径下确实能查到行，
//     证明失败路径的 "toBeNull()/计数不变" 不是查询写错导致的假通过
//
// 夹具租户按 pid 隔离，afterAll 自清理（含 ShareLink 软引用显式清）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { SHARE_CREATED_MARKER } from '../../src/lib/ops/share';
import type { CreateShareLinkOutput } from '../../src/lib/agent/tools/create-share-link';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `eval-tenant-m4-share-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

/** 运行时外呼探针：整个文件周期内 fetch 被劫持，任何一次调用都会被记账并抛错。 */
const fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  getNativeToolNames();
  globalThis.fetch = (async (input: unknown): Promise<never> => {
    fetchCalls.push(String(input));
    throw new Error('[evaluator] 检测到外呼 fetch —— P4 零暴露约束被破坏');
  }) as unknown as typeof fetch;

  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 share evaluator 夹具' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'evaluator 分享夹具项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'insight', projectId, env: 'default' };
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('E4 闸门不可绕过（模型侧无法自我放行）', () => {
  it('入参夹带 confirmationToken / gateActionId → 仍只得 pending，零副作用', async () => {
    const r = await executeTool(
      'create_share_link',
      {
        scope: 'project',
        projectId,
        confirmationToken: 'forged-token',
        gateActionId: 'forged-action',
      },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      }),
    ).toBe(0);
  });
});

describe('E1/E3/E5/E7 全链落库取证（scope=project）', () => {
  let paId: string;
  let plainToken: string;
  let shareLinkId: string;

  it('pending 阶段：harm 三要素在场 + expiresAt 被闸门确认窗覆盖（非工具内 now）', async () => {
    const before = Date.now();
    const r = await executeTool(
      'create_share_link',
      { scope: 'project', projectId, expiresInDays: 7 },
      ctx,
    );
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    paId = r.output.pendingActionId;
    const harm = r.output.harm;

    // ① 可见范围 ② 有效期 ③ 一经生成即暴露红标
    expect(harm.scope).toMatch(/本项目汇总指标/);
    expect(harm.evidence).toMatch(/有效期：7 天/);
    expect(harm.evidence).toMatch(/链接一经生成即暴露/);
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');

    // harm.expiresAt 必须是未来的确认窗（若沿用工具里的 new Date() 会 <= before）
    expect(new Date(harm.expiresAt).getTime()).toBeGreaterThan(before);
    const pa = await prisma.pendingAction.findUniqueOrThrow({
      where: { id: paId },
      select: { status: true, expiresAt: true, toolName: true },
    });
    expect(pa.toolName).toBe('create_share_link');
    expect(pa.status).toBe('pending');
    expect(harm.expiresAt).toBe(pa.expiresAt?.toISOString());
  });

  it('confirm+execute：原生 SQL 读回行（真打库）+ tokenHash=sha256(明文) + gateLogId 非空', async () => {
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    const out = exec.output as CreateShareLinkOutput;
    plainToken = out.token!;
    shareLinkId = out.shareLinkId;

    expect(out.mocked).toBe(true);
    expect(out.publicUrl).toBeNull();
    expect(plainToken).toMatch(/^[0-9a-f]{64}$/);

    // E1：绕过 Prisma model API，用原生 SQL 证明数据真的在 Postgres 里
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        scope: string;
        projectId: string | null;
        tokenHash: string | null;
        gateLogId: string | null;
        payloadRef: string;
        expiresAt: Date | null;
      }>
    >(
      `SELECT "id","scope","projectId","tokenHash","gateLogId","payloadRef","expiresAt" FROM "ShareLink" WHERE "id" = $1`,
      shareLinkId,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.scope).toBe('project');
    expect(row.projectId).toBe(projectId);
    expect(row.gateLogId).toBe(paId);
    expect(row.tokenHash).toBe(
      createHash('sha256').update(plainToken).digest('hex'),
    );
    expect(row.expiresAt).not.toBeNull();
    // payloadRef 不是可公开访问地址
    expect(row.payloadRef).not.toMatch(/^https?:\/\//);

    // E7 正向控制：irrev 留痕 + mock marker 在成功路径确实查得到（查询本身有效）
    expect(
      await prisma.operationLog.count({
        where: { tenantId, kind: 'irrev', ref: paId },
      }),
    ).toBe(1);
    expect(
      await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      }),
    ).toBe(1);
    // 票已消费 + 状态 executed
    const pa = await prisma.pendingAction.findUniqueOrThrow({
      where: { id: paId },
      select: { status: true, ticketUsedAt: true },
    });
    expect(pa.status).toBe('executed');
    expect(pa.ticketUsedAt).not.toBeNull();
  });

  it('E3 明文 token 未落任何库面（ShareLink 全列 / PendingAction JSON / OperationLog 全文）', async () => {
    const hits = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT (
         (SELECT count(*) FROM "ShareLink" WHERE "tenantId" = $1 AND (
            "payloadRef" LIKE '%' || $2 || '%' OR coalesce("tokenHash",'') = $2))
       + (SELECT count(*) FROM "PendingAction" WHERE "tenantId" = $1 AND (
            "inputJson"::text LIKE '%' || $2 || '%' OR "harmJson"::text LIKE '%' || $2 || '%'))
       + (SELECT count(*) FROM "OperationLog" WHERE "tenantId" = $1 AND (
            "summary" LIKE '%' || $2 || '%' OR coalesce("payloadJson"::text,'') LIKE '%' || $2 || '%'))
       ) AS n`,
      tenantId,
      plainToken,
    );
    expect(Number(hits[0]!.n)).toBe(0);
  });
});

describe('E6 并发双消费同一票 → 只建一行', () => {
  it('两路并发 execute：一成一败，ShareLink 只加一行、marker 只加一条', async () => {
    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    const markerBefore = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
    });

    const r = await executeTool('create_share_link', { scope: 'quarterly' }, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    const paId = r.output.pendingActionId;
    const conf = await confirmPendingAction(paId, ctx);

    const results = await Promise.allSettled([
      executePendingAction(paId, conf.ticket, ctx),
      executePendingAction(paId, conf.ticket, ctx),
    ]);
    const ok = results.filter((x) => x.status === 'fulfilled');
    const failed = results.filter((x) => x.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareBefore + 1,
    );
    expect(
      await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      }),
    ).toBe(markerBefore + 1);

    // quarterly 落库 projectId=null
    const rows = await prisma.$queryRawUnsafe<
      Array<{ projectId: string | null; scope: string }>
    >(
      `SELECT "projectId","scope" FROM "ShareLink" WHERE "tenantId" = $1 AND "gateLogId" = $2`,
      tenantId,
      paId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.projectId).toBeNull();
    expect(rows[0]!.scope).toBe('quarterly');
  });
});

describe('E2 运行时零外呼（P4 零真实公开暴露）', () => {
  it('全链路（pending→confirm→execute×2 scope）期间 fetch 一次未被调用', () => {
    expect(fetchCalls).toEqual([]);
  });

  it('落库面无任何可公开访问地址（publicUrl 无列、payloadRef 非 URL）', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ payloadRef: string }>>(
      `SELECT "payloadRef" FROM "ShareLink" WHERE "tenantId" = $1`,
      tenantId,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.payloadRef.startsWith('share-payload:')).toBe(true);
      expect(r.payloadRef).not.toMatch(/^https?:\/\//);
    }
  });
});
