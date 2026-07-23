// M3-A-REACH-CRM F008 — POST /api/reach/send：V6「发送」入口（executeTool 薄封装）
//
// 经唯一执行入口触发 send_outreach（outbound）→ 返回 pending 信封（副作用零发生），
// 前端凭 pendingActionId 走真链路：GET /api/actions/[id] 详情 → confirm → execute。
// subject 缺省派生（裁决 #2）：最新 draft 行主题 → 「合作邀约：{项目名}」；UI 不加字段。
// P3 明示拒绝（无 contactEmail）→ 400 原文透传。运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectId: z.string().min(1),
  kolId: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1, '正文不能为空'),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch((): null => null));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }
    const { projectId, kolId, body } = parsed.data;
    const ctx = await buildToolContext({ agentId: 'reach', projectId });

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

    const r = await executeTool(
      'send_outreach',
      { projectId, kolId, subject, body, language },
      ctx,
    );
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
