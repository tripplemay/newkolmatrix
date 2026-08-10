// M3-A-REACH-CRM F008 — POST /api/reach/send：V6「发送」入口（executeTool 薄封装）
//
// 经唯一执行入口触发 send_outreach（outbound）→ 返回 pending 信封（副作用零发生），
// 前端凭 pendingActionId 走真链路：GET /api/actions/[id] 详情 → confirm → execute。
// subject 缺省派生（裁决 #2）：最新 draft 行主题 → 「合作邀约：{项目名}」；UI 不加字段。
// P3 明示拒绝（无 contactEmail）→ 400 原文透传。运行时 = nodejs（Prisma）。

// M5.2-TENANT-COVERAGE F002 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 表态：本路由**不涉外呼**，用默认事务时长】send_outreach 是真投递工具，但在此处它被
// 闸门拦在确认前：只读 KOL / draft / 项目再落 PendingAction，全是 DB，工具的 run()（含 Resend
// 外呼）在这条路径上根本不执行。真投递发生在 /api/actions/[id]/execute——那条按 spec D-3 裁决
// 走领域层自带作用域，90s 外呼窗在那里。
//
// 【为什么把 subject 派生和 executeTool 包进**同一个**事务】派生出来的 subject 会进
// send_outreach 的建卡 payloadHash，而 confirm/execute 会用它复算比对。两者分处两个事务的话，
// 中间那一瞬有人改了 draft 行，卡上披露的和复算出来的就能对不上（恒 403）。
import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';
import { withSessionTenant } from 'lib/db/tenant-entry';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectId: z.string().min(1),
  kolId: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1, '正文不能为空'),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = bodySchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }
    const { projectId, kolId, body } = parsed.data;
    const ctx = await buildToolContext({ agentId: 'reach', projectId });

    const r = await withSessionTenant(async () => {
      // subject 派生（裁决 #2）：入参 → 最新 draft 行 → 项目名兜底
      let subject = parsed.data.subject?.trim() || '';
      let language: string | undefined;
      if (!subject) {
        const draftRow = await prisma.outreachMessage.findFirst({
          where: {
            tenantId: ctx.tenantId,
            direction: 'draft',
            thread: { projectId, kolId },
          },
          orderBy: { createdAt: 'desc' },
          select: { subject: true, language: true },
        });
        subject = draftRow?.subject ?? '';
        language = draftRow?.language ?? undefined;
        if (!subject) {
          const project = await prisma.project.findFirst({
            where: { id: projectId, tenantId: ctx.tenantId },
            select: { name: true },
          });
          subject = `合作邀约：${project?.name ?? '项目'}`;
        }
      }

      // fix_round1（验收 critical）：不携带 undefined 值键——显式 undefined 键会被 zod 保留、
      // 进入建卡 payloadHash，而 Prisma 写 JSONB 丢弃之 → confirm 复算必不匹配（403）。
      // stableStringify 已按 JSON 语义修复为主防线，此处为路由侧双保险。
      return executeTool(
        'send_outreach',
        { projectId, kolId, subject, body, ...(language ? { language } : {}) },
        ctx,
      );
    });
    if (!isPendingEnvelope(r.output)) {
      // outbound 无令牌恒 pending；到这里说明闸门被绕过——响亮报警不静默
      console.error('[api/reach/send] 非 pending 返回，闸门异常', r);
      return Response.json({ error: '内部异常，已拒绝发送' }, { status: 500 });
    }
    return Response.json(r.output);
  } catch (error) {
    // P3 明示拒绝等工具侧错误：原文透传（人可读、可行动）
    const msg = error instanceof Error ? error.message : '发送发起失败';
    const refusal = msg.includes('未录入联系邮箱');
    if (!refusal) console.error('[api/reach/send] 失败:', error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
