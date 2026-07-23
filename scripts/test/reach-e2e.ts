// M3-A-REACH-CRM F010 — 触达 E2E 闭环（PRD §15.3 M3：起草 → 审阅 → 点确认才发送）
//
// 链路：draft_email 真网关起草（L2 最小用量：1 次 chat）→ draft 落库 → send_outreach
// 无令牌 → pending（**副作用零发生断言**）→ confirm 签票 → execute 消费票 → 投递 →
// OutreachMessage(direction=sent, gateLogId, providerMessageId) + thread 推进 + irrev/推进留痕。
//
// 投递模式（P1 铁律：真实 KOL 地址零发信）：
// - mock（默认，无 RESEND_API_KEY）：MockEmailSender，SENT_MARKER 观测，不外呼
// - REAL（RESEND_API_KEY + OUTREACH_TEST_RECIPIENT 均在场）：真投递**仅达测试邮箱**，
//   夹具 KOL 的 contactEmail = OUTREACH_TEST_RECIPIENT；结束申报用量（封数 + providerMessageId）
// - SKIP_DRAFT_LLM=true：跳过真网关起草用固定草稿（无网关凭据环境的降级，明示不静默）
//
// 运行：npm run reach:e2e   退出码：0=全绿 / 1=任一失败。

import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { SENT_MARKER } from '../../src/lib/ops/email';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const REAL_MODE =
  !!process.env.RESEND_API_KEY && !!process.env.OUTREACH_TEST_RECIPIENT;
const TEST_EMAIL =
  process.env.OUTREACH_TEST_RECIPIENT ?? 'reach-e2e@test.invalid';
let llmCalls = 0;

async function main(): Promise<void> {
  console.log(
    `[reach-e2e] E2E 闭环开始（投递模式：${REAL_MODE ? `REAL → ${TEST_EMAIL}` : 'mock 不外呼'}）`,
  );
  getNativeToolNames();
  const ctx = await buildToolContext({ agentId: 'reach' });

  // ── 夹具：合成 KOL + 项目（P1：不触碰任何真实 KOL 行）──
  const fxKol = await prisma.kol.create({
    data: {
      tenantId: ctx.tenantId,
      canonicalHandle: `reach-e2e-kol-${process.pid}`,
      displayName: 'Reach E2E 测试创作者',
      language: 'zh',
      contactEmail: TEST_EMAIL,
      fieldProvenance: {
        contactEmail: { source: 'user_input', fetchedAt: new Date().toISOString() },
      },
    },
    select: { id: true },
  });
  const fxProject = await prisma.project.create({
    data: { tenantId: ctx.tenantId, name: `Reach E2E 项目 ${process.pid}` },
    select: { id: true },
  });
  const createdPA: string[] = [];

  try {
    // ── P1 前置断言：测试地址未落在任何真实 KOL 行上 ──
    const leaked = await prisma.kol.count({
      where: {
        tenantId: ctx.tenantId,
        contactEmail: TEST_EMAIL,
        id: { not: fxKol.id },
      },
    });
    assert(leaked === 0, 'P1: 测试地址仅在合成夹具行（真实 KOL 零染指）');

    // ── ① 起草（draft_email，真网关 L2 最小用量）──
    let draftBody: string;
    if (process.env.SKIP_DRAFT_LLM === 'true') {
      console.log('  ⚠ SKIP_DRAFT_LLM=true：跳过真网关起草，用固定草稿（明示降级）');
      const thread = await prisma.outreachThread.upsert({
        where: {
          projectId_kolId: { projectId: fxProject.id, kolId: fxKol.id },
        },
        create: {
          tenantId: ctx.tenantId,
          projectId: fxProject.id,
          kolId: fxKol.id,
          status: 'pending_send',
        },
        update: {},
        select: { id: true },
      });
      await prisma.outreachMessage.create({
        data: {
          tenantId: ctx.tenantId,
          threadId: thread.id,
          direction: 'draft',
          subject: 'E2E 固定草稿',
          body: '（跳过 LLM 的固定草稿正文）',
          language: 'zh',
        },
      });
      draftBody = '（跳过 LLM 的固定草稿正文）';
    } else {
      const r = await executeTool(
        'draft_email',
        {
          projectId: fxProject.id,
          kolId: fxKol.id,
          brief: 'E2E 闭环测试：邀请参与新游戏上线合作（此为测试邮件）',
        },
        ctx,
      );
      llmCalls += 1;
      const draft = r.output as { subject: string; body: string; language: string };
      assert(!!draft.subject && !!draft.body, '① draft_email 起草产出 subject/body（真网关）');
      assert(draft.language === 'zh', '① 语言随 KOL.language（NFR-I2）');
      draftBody = draft.body;
    }
    const draftRow = await prisma.outreachMessage.findFirst({
      where: {
        tenantId: ctx.tenantId,
        direction: 'draft',
        thread: { projectId: fxProject.id, kolId: fxKol.id },
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!draftRow, '① 草稿落库（OutreachMessage direction=draft，审阅数据源）');

    // ── ② 审阅后发起发送：无令牌 → pending，副作用零发生 ──
    const sentBefore = await prisma.outreachMessage.count({
      where: { tenantId: ctx.tenantId, direction: 'sent', threadId: draftRow!.threadId },
    });
    const markerBefore = await prisma.operationLog.count({
      where: { tenantId: ctx.tenantId, summary: { contains: SENT_MARKER } },
    });
    const send = await executeTool(
      'send_outreach',
      {
        projectId: fxProject.id,
        kolId: fxKol.id,
        subject: draftRow!.subject ?? 'E2E 邀约',
        body: draftBody,
        language: 'zh',
      },
      ctx,
    );
    assert(isPendingEnvelope(send.output), '② 无令牌 → pending 信封（停在确认前）');
    const env = send.output as { pendingActionId: string; harm: { targets: string[] } };
    createdPA.push(env.pendingActionId);
    assert(
      (await prisma.outreachMessage.count({
        where: { tenantId: ctx.tenantId, direction: 'sent', threadId: draftRow!.threadId },
      })) === sentBefore &&
        (await prisma.operationLog.count({
          where: { tenantId: ctx.tenantId, summary: { contains: SENT_MARKER } },
        })) === markerBefore,
      '② 副作用零发生（无 sent 行、无投递标记——「点确认才发送」）',
    );
    assert(
      env.harm.targets.length === 1 && env.harm.targets[0].includes(TEST_EMAIL),
      `② harm 如实披露唯一收件地址 = ${REAL_MODE ? 'OUTREACH_TEST_RECIPIENT' : '合成测试地址'}（P1）`,
    );

    // ── ③ 人确认：confirm 签票 → execute 消费票 → 投递 ──
    const conf = await confirmPendingAction(env.pendingActionId, ctx);
    const exec = await executePendingAction(env.pendingActionId, conf.ticket, ctx);
    const out = exec.output as {
      sent: true;
      to: string;
      mocked: boolean;
      providerMessageId: string | null;
      threadId: string;
      messageId: string;
    };
    assert(out.sent === true, '③ 确认后执行成功');
    assert(out.to === TEST_EMAIL, `③ 实际收件地址 = ${TEST_EMAIL}（P1：仅测试邮箱）`);
    if (REAL_MODE) {
      assert(out.mocked === false && !!out.providerMessageId, `③ 真实投递已发出（providerMessageId=${out.providerMessageId}）`);
    } else {
      assert(out.mocked === true && out.providerMessageId === null, '③ mock 投递（未外呼，SENT_MARKER 观测）');
    }

    // ── ④ 落库与留痕齐 ──
    const sentRow = await prisma.outreachMessage.findUnique({
      where: { id: out.messageId },
    });
    assert(
      sentRow?.direction === 'sent' && sentRow.gateLogId === env.pendingActionId,
      '④ OutreachMessage(direction=sent, gateLogId=PA.id) 落库（:468）',
    );
    const thread = await prisma.outreachThread.findUnique({
      where: { id: out.threadId },
    });
    assert(thread?.status === 'sent', '④ thread 经 crmInfer 推进 pending_send → sent');
    assert(
      (await prisma.operationLog.count({
        where: { tenantId: ctx.tenantId, kind: 'irrev', ref: env.pendingActionId },
      })) === 1,
      '④ irrev 留痕在场（同事务）',
    );
    assert(
      (await prisma.operationLog.count({
        where: {
          tenantId: ctx.tenantId,
          kind: 'auto',
          projectId: fxProject.id,
          summary: { contains: '触达状态推进' },
        },
      })) === 1,
      '④ 状态推进事件留痕在场',
    );

    // ── ⑤ P1 终局断言：本次链路未向任何非测试地址发信 ──
    const strayMsgs = await prisma.outreachMessage.count({
      where: {
        tenantId: ctx.tenantId,
        direction: 'sent',
        threadId: { not: out.threadId },
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    assert(strayMsgs === 0, 'P1: 5 分钟窗口内无夹具外 sent 行（真实 KOL 零发信）');

    console.log('[reach-e2e] ✅ E2E 闭环全绿');
    console.log(
      `[reach-e2e] L2 用量申报：gateway chat ${llmCalls} 次 · 真实投递 ${REAL_MODE ? `1 封 → ${TEST_EMAIL}` : '0 封（mock）'}`,
    );
  } finally {
    // 清理夹具（REAL 模式的投递记录随夹具清除；真实邮箱里的邮件即是外部证据）
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, summary: { contains: SENT_MARKER } },
    });
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, projectId: fxProject.id },
    });
    if (createdPA.length) {
      await prisma.operationLog.deleteMany({
        where: { tenantId: ctx.tenantId, ref: { in: createdPA } },
      });
      await prisma.pendingAction.deleteMany({ where: { id: { in: createdPA } } });
    }
    await prisma.signal.deleteMany({ where: { tenantId: ctx.tenantId, projectId: fxProject.id } });
    await prisma.project.deleteMany({ where: { id: fxProject.id } });
    await prisma.kol.deleteMany({ where: { id: fxKol.id } });
    console.log('[reach-e2e] 夹具已清理');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[reach-e2e] ❌ 失败：', err instanceof Error ? (err.stack ?? err.message) : err);
    await prisma.$disconnect();
    process.exit(1);
  });
