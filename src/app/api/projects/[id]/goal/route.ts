// M3-B-DELIVERY F011（BL-BRIEF-GOAL）— PATCH /api/projects/[id]/goal：目标确认（UI 入口）。
//
// 薄封装 lib/projects/set-goal.ts——与 confirm_brief_goal 工具共用同一服务（单一真相源）。
// internal 动作（D27 无确认框）；留痕由服务层事务承担。运行时 = nodejs（Prisma）。
//
// zod 校验逐字段 400 明示（targetExposure 非负整数 / ISO 日期 / periodStart<periodEnd）——
// 「参数错误」这种一句话回执让人无从改起，逐条列出才有用。

import { getDevTenantId } from 'lib/agent/context';
import { setProjectGoal, setProjectGoalInputSchema } from 'lib/projects/set-goal';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = setProjectGoalInputSchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_INPUT',
          error: '入参不合法',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    const tenantId = await getDevTenantId();
    const r = await setProjectGoal(tenantId, id, parsed.data, {
      actor: 'operator', // UI 入口 = 人直接操作
    });
    if (r.ok === false) {
      return Response.json(
        { code: r.code, error: '项目不存在' },
        { status: 404 },
      );
    }
    return Response.json({
      confirmed: true,
      project: r.project,
      goal: r.goal,
      replaced: r.replaced,
    });
  } catch (error) {
    console.error('[api/projects/goal] 失败:', error);
    return Response.json({ error: '确认失败，请重试' }, { status: 500 });
  }
}
