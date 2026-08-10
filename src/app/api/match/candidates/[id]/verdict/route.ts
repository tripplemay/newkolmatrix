// M2-B-CREATORS F006 — POST /api/match/candidates/{id}/verdict：人工裁定写入口。
//
// internal 动作（D27/:1352 双边铁律）：无确认弹窗、零 PendingAction——路由是
// setCandidateVerdict 服务的薄封装（裁定语义全在服务层）。
// 裁定后待裁定表自动离表（读侧 verdict:'pending' 已就绪，surface-data.ts）。
// 运行时 = nodejs（Prisma）。

import { z } from 'zod';
// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】setCandidateVerdict 只写裁定 + 留痕，全是 DB，用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { setCandidateVerdict } from 'lib/match/verdict';

export const runtime = 'nodejs';

const bodySchema = z.object({
  verdict: z.enum(['kept', 'dropped']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const tenantId = await requireSessionTenantId();

    const parsed = bodySchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: 'verdict 必须为 kept 或 dropped' },
        { status: 400 },
      );
    }

    const result = await withSessionTenant(() =>
      setCandidateVerdict(tenantId, id, parsed.data.verdict),
    );
    if (result.ok === false) {
      return Response.json({ error: '候选不存在' }, { status: 404 });
    }
    return Response.json({
      id: result.id,
      verdict: result.verdict,
      changed: result.changed,
    });
  } catch (error) {
    console.error('[api/match/verdict] 失败:', error);
    return Response.json({ error: '裁定失败，请重试' }, { status: 500 });
  }
}
