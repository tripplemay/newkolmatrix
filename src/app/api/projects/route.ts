// M2-C-AGENT-HONESTY F002 — POST /api/projects：项目创建（UI 入口）。
//
// 薄封装 lib/projects/create.ts——与 create_project 工具共用同一服务（单一真相源）。
// internal 动作（D27 无确认框）；留痕由服务层事务承担。运行时 = nodejs（Prisma）。

// M5.2-TENANT-COVERAGE F004 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】createProject 只建项目行 + 留痕，全是 DB，用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { createProject, createProjectInputSchema } from 'lib/projects/create';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const tenantId = await requireSessionTenantId();
    const parsed = createProjectInputSchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }
    const r = await withSessionTenant(() =>
      createProject(tenantId, parsed.data, {
        actor: 'operator', // UI 入口 = 人直接操作
      }),
    );
    if (r.ok === false) {
      return Response.json({ error: '所选游戏不存在' }, { status: 404 });
    }
    return Response.json({ created: true, project: r.project });
  } catch (error) {
    console.error('[api/projects] 失败:', error);
    return Response.json({ error: '创建失败，请重试' }, { status: 500 });
  }
}
