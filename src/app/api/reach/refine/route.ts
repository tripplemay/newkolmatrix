// M3-A-REACH-CRM F008 — POST /api/reach/refine：V6「重写」入口（裁决 #4，幽灵控件转真）
//
// 经唯一执行入口触发 refine_email（internal，gateway chat）；产出草稿已落库
//（OutreachMessage direction=draft，裁决 #3），响应携新草稿供 textarea 即时更新。
// 网关失败 → describeGatewayError 人话透传（错误态诚实呈现）。运行时 = nodejs。

import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { describeGatewayError } from 'lib/ai/gateway';

export const runtime = 'nodejs';

const bodySchema = z.object({
  projectId: z.string().min(1),
  kolId: z.string().min(1),
  subject: z.string().default(''),
  body: z.string().min(1, '草稿正文为空，无可重写'),
  instruction: z.string().optional(),
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
    const r = await executeTool(
      'refine_email',
      {
        ...parsed.data,
        instruction:
          parsed.data.instruction?.trim() ||
          '把这封草稿改写得更自然、简洁，保留全部事实信息',
      },
      ctx,
    );
    return Response.json(r.output);
  } catch (error) {
    console.error('[api/reach/refine] 失败:', error);
    return Response.json(
      { error: describeGatewayError(error) },
      { status: 502 },
    );
  }
}
