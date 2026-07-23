// M3-A-REACH-CRM F003 — send_outreach 接真集成测试（打真库，mock 信道，D20 义务）
//
// 覆盖 acceptance：
// 1. P3 明示拒绝：无 contactEmail → buildHarm 抛错，PendingAction **不产生**（拒在披露前）
// 2. 完整链路：pending → confirm（签票）→ execute（消费票）→ OutreachMessage(direction=sent,
//    gateLogId 非空, providerMessageId) 落库 + OutreachThread 经 crmInfer 推进 pending_send→sent
// 3. 幂等重入（P6）：同 gateActionId 重放 execute 体 → already=true，不双发不重复落库
// 4. 披露一致性：确认后 contactEmail 变更 → execute 拒发（新一轮披露原则）
//
// 信道走 MockEmailSender（本地/CI 无 RESEND_API_KEY，选择器分支 ②）——不外呼。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import {
  NO_CONTACT_EMAIL_MSG,
  sendOutreachTool,
} from '../../src/lib/agent/tools/send-outreach';
import { SENT_MARKER } from '../../src/lib/ops/email';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3a-send-${process.pid}`;
const TEST_EMAIL = 'm3a-send@test.invalid';

let tenantId: string;
let projectId: string;
let kolWithEmail: string;
let kolNoEmail: string;
let ctx: ToolContext;

const countSent = () =>
  prisma.operationLog.count({
    where: { tenantId, summary: { contains: SENT_MARKER } },
  });

beforeAll(async () => {
  getNativeToolNames(); // 触发工具注册
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A send 集成测试夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3A send 夹具项目' },
  });
  projectId = p.id;
  const k1 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-send-has-email-${process.pid}`,
      displayName: '有邮箱创作者',
      contactEmail: TEST_EMAIL,
      fieldProvenance: { contactEmail: 'user_input' },
    },
  });
  kolWithEmail = k1.id;
  const k2 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-send-no-email-${process.pid}`,
      displayName: '无邮箱创作者',
    },
  });
  kolNoEmail = k2.id;
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

describe('P3 明示拒绝不猜', () => {
  it('无 contactEmail → 抛明示错误，PendingAction 不产生（拒在披露前）', async () => {
    const paBefore = await prisma.pendingAction.count({ where: { tenantId } });
    await expect(
      executeTool(
        'send_outreach',
        { projectId, kolId: kolNoEmail, subject: '你好', body: '正文' },
        ctx,
      ),
    ).rejects.toThrowError(NO_CONTACT_EMAIL_MSG);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      paBefore,
    );
    expect(await countSent()).toBe(0);
  });
});

describe('完整链路：pending → confirm → execute → 落库 + 状态推进', () => {
  let paId: string;

  it('outbound 拦截：pending 信封披露真实收件地址', async () => {
    const r = await executeTool(
      'send_outreach',
      {
        projectId,
        kolId: kolWithEmail,
        subject: '合作邀约',
        body: '你好，想邀请你参与……',
        language: 'zh',
      },
      ctx,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    paId = r.output.pendingActionId;
    expect(r.output.harm.targets.some((t) => t.includes(TEST_EMAIL))).toBe(
      true,
    );
    expect(await countSent()).toBe(0); // 副作用未发生
  });

  it('confirm 签票 → execute 消费票 → OutreachMessage/Thread 落库', async () => {
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    expect(exec.executed).toBe(true);

    const out = exec.output as {
      sent: true;
      already: boolean;
      mocked: boolean;
      threadId: string;
      providerMessageId: string | null;
    };
    expect(out.already).toBe(false);
    expect(out.mocked).toBe(true); // 无 key → MockEmailSender（不外呼）
    expect(out.providerMessageId).toBeNull();

    const msg = await prisma.outreachMessage.findFirst({
      where: { tenantId, gateLogId: paId, direction: 'sent' },
    });
    expect(msg).not.toBeNull();
    expect(msg?.subject).toBe('合作邀约');
    expect(msg?.language).toBe('zh');
    expect(msg?.sentAt).not.toBeNull();

    const thread = await prisma.outreachThread.findUnique({
      where: { projectId_kolId: { projectId, kolId: kolWithEmail } },
    });
    expect(thread?.status).toBe('sent'); // crmInfer 推进（三处复用铁律）

    const advanceLog = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'auto', summary: { contains: '触达状态推进' } },
    });
    expect(advanceLog?.projectId).toBe(projectId);
    expect(advanceLog?.payloadJson).toMatchObject({
      from: 'pending_send',
      to: 'sent',
    });
    expect(await countSent()).toBe(1);
  });

  it('幂等重入（P6）：同 gateActionId 重放执行体 → already=true 不双发不重复落库', async () => {
    const sentBefore = await countSent();
    const msgBefore = await prisma.outreachMessage.count({
      where: { tenantId },
    });
    // 模拟 crash 后重放：绕过闸门状态机直接重入执行体（gateActionId 相同）
    const replay = (await sendOutreachTool.execute(
      {
        projectId,
        kolId: kolWithEmail,
        subject: '合作邀约',
        body: '你好，想邀请你参与……',
      } as never,
      { ...ctx, gateActionId: paId },
    )) as { already: boolean };
    expect(replay.already).toBe(true);
    expect(await countSent()).toBe(sentBefore); // 未再外呼
    expect(await prisma.outreachMessage.count({ where: { tenantId } })).toBe(
      msgBefore,
    ); // 未重复落库
  });
});

describe('披露一致性复核', () => {
  it('确认后 contactEmail 变更 → execute 拒发（要求新一轮披露）', async () => {
    const r = await executeTool(
      'send_outreach',
      { projectId, kolId: kolWithEmail, subject: '第二封', body: '正文二' },
      ctx,
    );
    if (!isPendingEnvelope(r.output)) throw new Error('预期 pending 信封');
    const pa2 = r.output.pendingActionId;
    const conf = await confirmPendingAction(pa2, ctx);
    // 确认后地址被改（15 分钟窗口内的变更）
    await prisma.kol.update({
      where: { id: kolWithEmail },
      data: { contactEmail: 'changed@test.invalid' },
    });
    await expect(
      executePendingAction(pa2, conf.ticket, ctx),
    ).rejects.toThrowError(/与确认卡披露不一致/);
    // 副作用失败 → failed、无 irrev 行（F002 语义）
    const row = await prisma.pendingAction.findUnique({ where: { id: pa2 } });
    expect(row?.status).toBe('failed');
    expect(
      await prisma.operationLog.count({
        where: { tenantId, kind: 'irrev', ref: pa2 },
      }),
    ).toBe(0);
  });
});
