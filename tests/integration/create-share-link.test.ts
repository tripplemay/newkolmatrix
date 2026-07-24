// M4-INSIGHT F008 — create_share_link 闸门集成测试（打真库，两步票据全链）
//
// 覆盖 acceptance：
// - 注册 + 挂 insight 人格（同源断言）+ class=outbound + async buildHarm 三要素
//   （可见范围 / 有效期 / 「一经生成即暴露」红标）
// - 无令牌 → pending 信封（副作用零发生：无 ShareLink 行、无 SHARE_CREATED_MARKER）
// - 执行后 ShareLink 落库 + gateLogId 非空 + tokenHash 在场（明文 token 仅 execute 响应现一次，
//   DB 只存 hash）+ irrev 留痕同事务
// - scope=project 带 projectId / quarterly 跨项目 null
// - 失败（窗口内项目被删）→ execute 拒 + 无 irrev 行 + 业务回滚（无 ShareLink 行）
// - 幂等重入不双建（票已消费拒 + 执行体层 already=true 且 token=null 不重发明文）
// - P4 零真实公开暴露断言（mocked=true + publicUrl=null + mock 观测标记）

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
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { SHARE_CREATED_MARKER } from '../../src/lib/ops/share';
import {
  SHARE_PROJECT_NOT_FOUND_MSG,
  SHARE_PROJECT_REQUIRED_MSG,
  type CreateShareLinkOutput,
} from '../../src/lib/agent/tools/create-share-link';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m4-share-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

const markerCount = () =>
  prisma.operationLog.count({
    where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
  });

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 share 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: '分享夹具项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'insight', projectId, env: 'default' };
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } }); // 软引用不随 project 级联，显式清
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与契约', () => {
  it('create_share_link 已注册、class=outbound、有 async buildHarm', () => {
    const tool = getTool('create_share_link');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('outbound');
    expect(typeof tool?.buildHarm).toBe('function');
  });

  it('挂 insight 人格，且人格声明的工具名真实存在于注册表（同源断言）', () => {
    const insight = listPersonas().find((p) => p.id === 'insight');
    expect(insight?.tools).toContain('create_share_link');
    for (const name of insight?.tools ?? []) {
      expect(getTool(name), `人格声明的工具 ${name} 不在注册表`).toBeTruthy();
    }
  });
});

describe('闸门全链（scope=project）', () => {
  let paId: string;
  let plainToken: string;

  it('无令牌直调 → pending 信封 + harm 三要素齐；副作用零发生', async () => {
    const r = await executeTool(
      'create_share_link',
      { scope: 'project', projectId },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    paId = r.output.pendingActionId;
    const harm = r.output.harm;
    expect(harm.scope).toBe('本项目汇总指标 · 不含联系方式'); // ① 可见范围
    expect(harm.summary).toContain('有效期 14 天'); // ② 有效期（默认 14）
    expect(harm.evidence).toContain('链接一经生成即暴露'); // ③ 红标
    expect(harm.evidence).toContain('无法收回');
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');
    expect(harm.targets).toContain('任何持有链接者（不限于系统内用户）');

    // 副作用零发生：无 ShareLink 行、无 mock 观测标记
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(0);
    expect(await markerCount()).toBe(0);
  });

  it('确认 + 执行：ShareLink 落库 + gateLogId + tokenHash + irrev 同事务；token 明文仅此一次', async () => {
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    const out = exec.output as CreateShareLinkOutput;

    expect(out.created).toBe(true);
    expect(out.already).toBe(false);
    expect(out.scope).toBe('project');
    expect(out.projectId).toBe(projectId);
    expect(out.token).toBeTruthy(); // 明文仅本响应出现一次
    expect(out.mocked).toBe(true); // P4：零真实公开暴露
    expect(out.publicUrl).toBeNull();
    plainToken = out.token!;

    const row = await prisma.shareLink.findUniqueOrThrow({
      where: { id: out.shareLinkId },
    });
    expect(row.gateLogId).toBe(paId); // 生成经闸门必非空
    expect(row.scope).toBe('project');
    expect(row.projectId).toBe(projectId);
    expect(row.payloadRef).toBe(out.payloadRef);
    // DB 只存 hash：tokenHash = sha256(明文)，且明文不在任何列
    expect(row.tokenHash).toBe(
      createHash('sha256').update(plainToken).digest('hex'),
    );
    expect(row.tokenHash).not.toBe(plainToken);
    expect(row.expiresAt).not.toBeNull();

    // irrev 留痕（与业务写入同事务）
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'irrev', ref: paId },
    });
    expect(irrev).not.toBeNull();
    // mock 分享创建发生了，且只发生一次
    expect(await markerCount()).toBe(1);

    // token 明文不落任何留痕（ADR-25）
    const logsWithToken = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: plainToken } },
    });
    expect(logsWithToken).toBe(0);
  });

  it('幂等重入：票已消费拒；执行体层同 gateActionId 重放 → already=true 且不重发明文 token', async () => {
    await expect(
      executePendingAction(paId, 'any-ticket', ctx),
    ).rejects.toThrowError(); // 票已消费（409 语义）
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(1);

    const tool = getTool('create_share_link');
    const replay = (await tool!.execute(
      { scope: 'project', projectId, expiresInDays: 14 } as never,
      { ...ctx, confirmationToken: 'internal', gateActionId: paId },
    )) as CreateShareLinkOutput;
    expect(replay.already).toBe(true);
    expect(replay.token).toBeNull(); // 明文不可复现，如实 null
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(1); // 不双建
    expect(await markerCount()).toBe(1); // 未再次触发 mock 副作用
  });
});

describe('scope=quarterly（跨项目）', () => {
  it('quarterly 无需 projectId：落库 projectId=null + scope 披露为季度口径', async () => {
    const r = await executeTool('create_share_link', { scope: 'quarterly' }, ctx);
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    expect(r.output.harm.scope).toBe('季度汇总指标 · 不含联系方式');

    const conf = await confirmPendingAction(r.output.pendingActionId, ctx);
    const exec = await executePendingAction(
      r.output.pendingActionId,
      conf.ticket,
      ctx,
    );
    const out = exec.output as CreateShareLinkOutput;
    expect(out.scope).toBe('quarterly');
    expect(out.projectId).toBeNull();

    const row = await prisma.shareLink.findUniqueOrThrow({
      where: { id: out.shareLinkId },
    });
    expect(row.projectId).toBeNull();
    expect(row.scope).toBe('quarterly');
  });
});

describe('明示拒绝与失败回滚', () => {
  it('scope=project 缺 projectId → buildHarm 阶段即拒，PendingAction 不产生', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await expect(
      executeTool('create_share_link', { scope: 'project' }, ctx),
    ).rejects.toThrowError(new RegExp(SHARE_PROJECT_REQUIRED_MSG));
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });

  it('项目不存在 → 明示拒绝', async () => {
    await expect(
      executeTool(
        'create_share_link',
        { scope: 'project', projectId: 'nonexistent' },
        ctx,
      ),
    ).rejects.toThrowError(new RegExp(SHARE_PROJECT_NOT_FOUND_MSG));
  });

  it('pending→confirm 窗口内项目被删 → execute 拒 + 无 irrev 行 + 业务回滚（无 ShareLink 行）', async () => {
    const doomed = await prisma.project.create({
      data: { tenantId, name: '将被删除的项目' },
    });
    const r = await executeTool(
      'create_share_link',
      { scope: 'project', projectId: doomed.id },
      ctx,
    );
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    const doomedPaId = r.output.pendingActionId;
    const conf = await confirmPendingAction(doomedPaId, ctx);

    await prisma.project.delete({ where: { id: doomed.id } }); // 窗口内退化

    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    const markerBefore = await markerCount();
    await expect(
      executePendingAction(doomedPaId, conf.ticket, ctx),
    ).rejects.toThrowError(new RegExp(SHARE_PROJECT_NOT_FOUND_MSG));

    // 业务回滚：无新 ShareLink 行、无新 mock 标记、无 irrev 行
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(
      shareBefore,
    );
    expect(await markerCount()).toBe(markerBefore);
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'irrev', ref: doomedPaId },
    });
    expect(irrev).toBeNull();
    const pa = await prisma.pendingAction.findUnique({
      where: { id: doomedPaId },
      select: { status: true },
    });
    expect(pa?.status).toBe('failed');
  });

  it('入参契约：坏 scope 被拒', async () => {
    await expect(
      executeTool('create_share_link', { scope: 'global' }, ctx),
    ).rejects.toThrow('入参校验失败');
  });
});

describe('P4 零真实公开暴露（批次硬约束）', () => {
  it('全部已建 ShareLink 无真实公开地址；mock 观测标记与落库行数一致', async () => {
    const rows = await prisma.shareLink.findMany({ where: { tenantId } });
    expect(rows.length).toBeGreaterThan(0);
    // 落库面无任何 URL 形态字段值（payloadRef 是内部引用，非可公开访问地址）
    for (const row of rows) {
      expect(row.payloadRef.startsWith('share-payload:')).toBe(true);
      expect(row.payloadRef).not.toMatch(/^https?:\/\//);
    }
    expect(await markerCount()).toBe(rows.length);
  });
});
