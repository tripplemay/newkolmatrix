// M3-A-REACH-CRM F009 — POST /api/reach/override：CRM 人工覆盖入口（U4 有限覆盖）
//
// 薄封装 lib/reach/manual-override（服务层承载语义：Signal(manual_override) → 同一推断
// 管道 → 留痕）。zod enum 三态白名单——「已确认」在此 400 不可达（confirmed 唯一路径 =
// commit_quote 闸门）。internal 动作（人工标记可被后续事实覆盖修正，无确认框——D27 边界）。
// 运行时 = nodejs（Prisma）。

// M5.2-TENANT-COVERAGE F002 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】applyManualOverride 只写 Signal → 走 crmInfer 推断 → 落留痕，全是 DB，
// 用默认事务时长。
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import {
  applyManualOverride,
  manualOverrideInputSchema,
} from 'lib/reach/manual-override';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = manualOverrideInputSchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: '入参不合法：仅可标记 已发送 / 已回复 / 谈判中（「已确认」须经报价闸门）' },
        { status: 400 },
      );
    }
    const tenantId = await requireSessionTenantId();
    const result = await withSessionTenant(() =>
      applyManualOverride(parsed.data, {
        tenantId,
        actor: 'operator', // UI 入口 = 人直接操作
      }),
    );
    return Response.json(result);
  } catch (error) {
    console.error('[api/reach/override] 失败:', error);
    return Response.json({ error: '标记失败，请重试' }, { status: 500 });
  }
}
