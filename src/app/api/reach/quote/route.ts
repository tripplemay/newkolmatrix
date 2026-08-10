// M3-A-REACH-CRM F008 — POST /api/reach/quote：V6「确认报价」入口（executeTool 薄封装）
//
// 条款来源 = 前置最小表单（裁决 #1：人是谈判条款唯一权威输入源）。经唯一执行入口触发
// commit_quote（outbound）→ pending 信封 → 前端走真链路 GET 详情 → confirm → execute。
// 权威校验在此（zod）；前端表单仅格式提示（裁决叮嘱 ③）。运行时 = nodejs（Prisma）。

// M5.2-TENANT-COVERAGE F002 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 表态：本路由**不涉外呼**，用默认事务时长】commit_quote 是 outbound，但它在此处
// 被闸门拦在确认前——只落 PendingAction + 留痕，全是 DB。真正的副作用发生在
// /api/actions/[id]/execute，那条按 spec D-3 裁决走领域层自带作用域（含 90s 外呼窗）。
import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { isPendingEnvelope } from 'lib/agent/gate/harm';
import { withSessionTenant } from 'lib/db/tenant-entry';

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
    const r = await withSessionTenant(() =>
      executeTool('commit_quote', parsed.data, ctx),
    );
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
