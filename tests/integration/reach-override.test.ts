// M3-A-REACH-CRM F009 — CRM 人工覆盖集成测试（打真库；U4 有限覆盖）
//
// 覆盖 acceptance：
// 1. 三态白名单：zod enum 拒绝 confirmed（「已确认」写入口不可达——负例断言）
// 2. 覆盖落 Signal(manual_override) 走 crmInfer 管道**非直改列**（signal 行在场 +
//    thread.status = 纯函数合成值）
// 3. OperationLog 留痕含操作者与前后态
// 4. 合成规则（F005 同款语义在写入口成立）：断言落后于事件面 → 不回退（effective=false 留痕）
// 5. 越权断言 confirmed 经底层信号注入（绕过写入口）→ 管道忽略 + 状态不动（防御纵深）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import {
  applyManualOverride,
  manualOverrideInputSchema,
} from '../../src/lib/reach/manual-override';
import { recomputeThreadStatus } from '../../src/lib/reach/recompute-status';

const FIXTURE_SLUG = `test-tenant-m3a-override-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A override 集成测试夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'override 夹具项目' },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-override-kol-${process.pid}`,
      displayName: 'override 夹具创作者',
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

describe('U4 三态白名单（「已确认」写入口不可达）', () => {
  it('zod enum 仅收 sent/replied/negotiating；confirmed / pending_send / 杂串全拒', () => {
    const base = { projectId: 'p', kolId: 'k' };
    for (const ok of ['sent', 'replied', 'negotiating']) {
      expect(
        manualOverrideInputSchema.safeParse({ ...base, status: ok }).success,
      ).toBe(true);
    }
    for (const bad of ['confirmed', 'pending_send', '已确认', '', undefined]) {
      expect(
        manualOverrideInputSchema.safeParse({ ...base, status: bad }).success,
      ).toBe(false);
    }
  });
});

describe('覆盖走推断管道（非直改列）+ 留痕', () => {
  it('断言 replied → Signal(manual_override) 落库 + thread 合成为 replied + 留痕含操作者与前后态', async () => {
    const r = await applyManualOverride(
      { projectId, kolId, status: 'replied' },
      { tenantId, actor: 'operator' },
    );
    expect(r).toMatchObject({
      asserted: 'replied',
      from: 'pending_send',
      to: 'replied',
      effective: true,
    });

    // 覆盖以 Signal 形态在场（非直改列的证据 ①）
    const sig = await prisma.signal.findUnique({ where: { id: r.signalId } });
    expect(sig).toMatchObject({
      type: 'manual_override',
      source: 'user',
      threadId: r.threadId,
    });
    expect(sig?.payloadJson).toEqual({ status: 'replied' });

    // thread 列值 = 推断管道合成值（证据 ②：重算幂等同值）
    const thread = await prisma.outreachThread.findUnique({
      where: { id: r.threadId },
    });
    expect(thread?.status).toBe('replied');
    expect(thread?.lastSignalAt).not.toBeNull();
    const again = await recomputeThreadStatus(r.threadId, { tenantId });
    expect(again.status).toBe('replied');
    expect(again.changed).toBe(false);

    // 留痕含操作者与前后态（acceptance 3）
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: '人工覆盖触达状态' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.actor).toBe('operator');
    expect(log?.payloadJson).toMatchObject({
      asserted: 'replied',
      from: 'pending_send',
      to: 'replied',
      effective: true,
    });
  });

  it('人工修正通道（F005 已裁决：多 override 取最新）：纯 override 场景再标 sent → 最新合法断言生效', async () => {
    const r = await applyManualOverride(
      { projectId, kolId, status: 'sent' },
      { tenantId, actor: 'operator' },
    );
    // 事件面为空（无真实消息），replied 仅由前一条 override 支撑——最新 override 替换之，
    // 这正是「先前标错可修正」的人工修正语义（降级修正走 override 替换，非直改列）。
    expect(r.to).toBe('sent');
    expect(r.effective).toBe(true);
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: '断言「已发送」' } },
    });
    expect(log?.payloadJson).toMatchObject({ from: 'replied', to: 'sent' });
  });

  it('事件面地板不可被 override 拉低：真实 inbound 消息在场（≥replied）→ 标 sent 不回退（effective=false）', async () => {
    const thread = await prisma.outreachThread.findFirstOrThrow({
      where: { tenantId, projectId, kolId },
    });
    // 库内实物：一条真实回复消息 → 事件面地板 = replied
    await prisma.outreachMessage.create({
      data: {
        tenantId,
        threadId: thread.id,
        direction: 'inbound',
        body: '收到，有兴趣聊聊',
      },
    });
    const r = await applyManualOverride(
      { projectId, kolId, status: 'sent' },
      { tenantId, actor: 'operator' },
    );
    expect(r.to).toBe('replied'); // max(事件面 replied, 断言 sent) —— 不回退
    expect(r.effective).toBe(false);
    const thread2 = await prisma.outreachThread.findUnique({
      where: { id: r.threadId },
    });
    expect(thread2?.status).toBe('replied');
  });

  it('防御纵深：绕过写入口注入 confirmed 越权信号 → 管道忽略，状态不动（U4）', async () => {
    const thread = await prisma.outreachThread.findFirstOrThrow({
      where: { tenantId, projectId, kolId },
    });
    await prisma.signal.create({
      data: {
        tenantId,
        type: 'manual_override',
        source: 'user',
        externalId: `manual-rogue-${process.pid}`,
        threadId: thread.id,
        payloadJson: { status: 'confirmed' },
        detectedAt: new Date(),
      },
    });
    const rec = await recomputeThreadStatus(thread.id, { tenantId });
    expect(rec.status).toBe('replied'); // confirmed 不可由 override 推出（事件面 replied 维持）
    expect(
      rec.infer.ignoredOverrides.some(
        (o) => o.reason === 'CONFIRMED_NOT_OVERRIDABLE',
      ),
    ).toBe(true);
  });
});
