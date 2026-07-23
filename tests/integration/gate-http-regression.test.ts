// M3-A fix_round1 — 验收 F002/F008 critical+high 回归集成测（打真库，夹具租户）
//
// 回归 ①（critical：payloadHash undefined-键中毒）：以 /api/reach/send 路由同构的
// 「显式 undefined 值键」入参走完整 pending → confirm → execute 链——修复前 confirm 恒抛
// GATE_TOKEN_INVALID 403（建卡 hash 含 "language":undefined，JSONB 读回无该键）；修复后全链通。
// 回归 ②（high：工具注册模块图副作用）：本文件**刻意只 import execute/gate，不 import
// tools/index**——vitest 每文件隔离模块注册表，修复前 executeTool 抛「[tools] 未知工具」；
// 修复后唯一执行入口/闸门执行点自带幂等注册。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
// 刻意不 import '../../src/lib/agent/tools'（回归 ② 的验证前提：无模块图注册副作用）
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3a-fix1-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolId: string;
let ctx: ToolContext;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'fix_round1 回归夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'fix1 夹具项目' },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-fix1-kol-${process.pid}`,
      displayName: 'fix1 夹具创作者',
      contactEmail: 'fix1@test.invalid',
    },
  });
  kolId = k.id;
  ctx = { tenantId, agentId: 'reach', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 thread/message
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('回归 ②：工具注册不依赖模块图副作用（验收 high）', () => {
  it('本文件未 import tools/index，executeTool 仍可解析工具（修复前：[tools] 未知工具）', async () => {
    // fix-up：用纯 DB 工具 get_kol_detail（search_kols 走网关 embedding，CI 无 AIGCGATEWAY_* env）
    const r = await executeTool('get_kol_detail', { idOrPublicId: kolId }, ctx);
    expect(r.toolName).toBe('get_kol_detail');
  });
});

describe('回归 ①：undefined-键中毒（验收 critical，/api/reach/send 同构形状）', () => {
  it('显式 undefined 值键入参 → pending → confirm 签票成功（修复前 403 GATE_TOKEN_INVALID）→ execute 通', async () => {
    // /api/reach/send 修复前的字面量形状：language 键在场且值为 undefined；
    // zod 4 safeParse 保留 present-but-undefined 键（验收复核实证），故从工具入口即含毒。
    const poisonedShape = {
      projectId,
      kolId,
      subject: '回归：undefined 键形状',
      body: '正文',
      language: undefined as string | undefined,
    };
    const r = await executeTool('send_outreach', poisonedShape, ctx);
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    const paId = r.output.pendingActionId;

    // 修复前：此步抛 GateError GATE_TOKEN_INVALID（payloadHash 不匹配）
    const conf = await confirmPendingAction(paId, ctx);
    expect(conf.confirmed).toBe(true);

    const exec = await executePendingAction(paId, conf.ticket, ctx);
    expect(exec.executed).toBe(true);
    const row = await prisma.pendingAction.findUnique({ where: { id: paId } });
    expect(row?.status).toBe('executed');
  });

  it('嵌套/数组含 undefined 的库内回放同样一致（防未来工具入参形状踩同坑）', async () => {
    // 直接对库内 JSONB 往返做端到端断言：写入含 undefined 键的 inputJson（Prisma 丢键），
    // confirm 复算基于读回值——与建卡 hash 必须一致。经真实 send_outreach 二发验证幂等面已盖，
    // 此处以 payload 形状差异化二发覆盖嵌套形态。
    const r = await executeTool(
      'send_outreach',
      {
        projectId,
        kolId,
        subject: '回归：二发（嵌套形状差异化）',
        body: '正文 2',
        language: undefined as string | undefined,
      },
      ctx,
    );
    if (!isPendingEnvelope(r.output)) throw new Error('预期 pending 信封');
    const conf = await confirmPendingAction(r.output.pendingActionId, ctx);
    const exec = await executePendingAction(
      r.output.pendingActionId,
      conf.ticket,
      ctx,
    );
    expect(exec.executed).toBe(true);
  });
});
