// M3-A-REACH-CRM F008 — POST /api/reach/refine：V6「重写」入口（裁决 #4，幽灵控件转真）
//
// 经唯一执行入口触发 refine_email（internal，gateway chat）；产出草稿已落库
//（OutreachMessage direction=draft，裁决 #3），响应携新草稿供 textarea 即时更新。
// 网关失败 → describeGatewayError 人话透传（错误态诚实呈现）。运行时 = nodejs。

// M5.2-TENANT-COVERAGE F002 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
//
// 【D-4 事务边界表态：外呼**在事务内**，timeout 由网关的 abort 上限派生】
// refine_email 是「读 KOL / 读项目 → 调网关 chat 改写 → 写 OutreachMessage(draft)」一整段
//（src/lib/agent/tools/email-drafting.ts），三步在同一个工具里，路由层拆不开。
// 于是把整段包进一个事务，代价是这条路由**会持有一条连接直到网关返回**。
//
// timeout 为什么不写死一个数：网关自己的 abort 上限是 `AIGC_TIMEOUT_MS`（默认 15s，
// **env 可覆盖**）。写死 30s 的话，谁把 AIGC_TIMEOUT_MS 调到 60s，事务就会先于外呼死掉——
// 草稿写不进去，而现场只看到一条事务超时。故此处**从那个常量派生**，让两者永远同向移动。
// 余量 10s 覆盖两次 DB 读 + 一次写 + 取连接。
import { z } from 'zod';
import { buildToolContext } from 'lib/agent/context';
import { executeTool } from 'lib/agent/execute';
import { AIGC_TIMEOUT_MS, describeGatewayError } from 'lib/ai/gateway';
import { withSessionTenant } from 'lib/db/tenant-entry';

export const runtime = 'nodejs';

/** 事务须**长于**网关 abort 上限，否则事务先死、草稿丢失（D-4 表态，见文件头）。 */
const REFINE_TX_TIMEOUT_MS = AIGC_TIMEOUT_MS + 10_000;

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
    const r = await withSessionTenant(
      () =>
        executeTool(
          'refine_email',
          {
            ...parsed.data,
            instruction:
              parsed.data.instruction?.trim() ||
              '把这封草稿改写得更自然、简洁，保留全部事实信息',
          },
          ctx,
        ),
      { timeout: REFINE_TX_TIMEOUT_MS },
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
