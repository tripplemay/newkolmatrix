// M3-A-REACH-CRM F008 — POST /api/reach/quote：V6「确认报价」入口（executeTool 薄封装）
//
// 条款来源 = 前置最小表单（裁决 #1：人是谈判条款唯一权威输入源）。经唯一执行入口触发
// commit_quote（outbound）→ pending 信封 → 前端走真链路 GET 详情 → confirm → execute。
// 权威校验在此（zod）；前端表单仅格式提示（裁决叮嘱 ③）。运行时 = nodejs（Prisma）。

import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectId: z.string().min(1),
  kolId: z.string().min(1),
  amount: z.number().positive('金额必须为正数'),
  currency: z.string().length(3, '币种须为 3 位 ISO 4217 码'),
  deliverables: z.array(z.string().min(1)).min(1, '至少一项交付物'),
  scope: z.string().optional(),
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
    const ctx = await buildToolContext({
      agentId: 'reach',
      projectId: parsed.data.projectId,
    });
    const r = await executeTool('commit_quote', parsed.data, ctx);
    if (!isPendingEnvelope(r.output)) {
      console.error('[api/reach/quote] 非 pending 返回，闸门异常', r);
      return Response.json({ error: '内部异常，已拒绝报价' }, { status: 500 });
    }
    return Response.json(r.output);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '报价发起失败';
    console.error('[api/reach/quote] 失败:', error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
