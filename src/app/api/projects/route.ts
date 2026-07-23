// M2-C-AGENT-HONESTY F002 — POST /api/projects：项目创建（UI 入口）。
//
// 薄封装 lib/projects/create.ts——与 create_project 工具共用同一服务（单一真相源）。
// internal 动作（D27 无确认框）；留痕由服务层事务承担。运行时 = nodejs（Prisma）。

import { getDevTenantId } from 'lib/agent/context';
import { createProject, createProjectInputSchema } from 'lib/projects/create';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const tenantId = await getDevTenantId();
    const parsed = createProjectInputSchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '入参不合法' },
        { status: 400 },
      );
    }
    const r = await createProject(tenantId, parsed.data, {
      actor: 'operator', // UI 入口 = 人直接操作
    });
    if (r.ok === false) {
      return Response.json({ error: '所选游戏不存在' }, { status: 404 });
    }
    return Response.json({ created: true, project: r.project });
  } catch (error) {
    console.error('[api/projects] 失败:', error);
    return Response.json({ error: '创建失败，请重试' }, { status: 500 });
  }
}
