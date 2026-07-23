// M3-A-REACH-CRM F009 — POST /api/reach/override：CRM 人工覆盖入口（U4 有限覆盖）
//
// 薄封装 lib/reach/manual-override（服务层承载语义：Signal(manual_override) → 同一推断
// 管道 → 留痕）。zod enum 三态白名单——「已确认」在此 400 不可达（confirmed 唯一路径 =
// commit_quote 闸门）。internal 动作（人工标记可被后续事实覆盖修正，无确认框——D27 边界）。
// 运行时 = nodejs（Prisma）。

import { getDevTenantId } from 'lib/agent/context';
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
    const tenantId = await getDevTenantId();
    const result = await applyManualOverride(parsed.data, {
      tenantId,
      actor: 'operator', // UI 入口 = 人直接操作
    });
    return Response.json(result);
  } catch (error) {
    console.error('[api/reach/override] 失败:', error);
    return Response.json({ error: '标记失败，请重试' }, { status: 500 });
  }
}
