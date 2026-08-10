// M3-A-REACH-CRM F007 — PATCH /api/kols/{id}/contact：contactEmail 人工录入口（P3）。
//
// internal 动作（D27/:1352 双边铁律）：录入联系方式本身不外呼——无确认弹窗、零
// PendingAction；真正的发信仍经 send_outreach 的 outbound 闸门（F003）。
// M2-B verdict 路由（api/match/candidates/[id]/verdict）同款薄封装：zod 校验 +
// 错误明示 + nodejs runtime；语义全在 lib/kols/contact-email 服务层。
// 先校验 body 再解析租户（fail fast）：400 路径不依赖 dev tenant——CI 无 seed 库也可测。
// ⚠️ P1：真实 KOL 行不得写入测试地址（验收仅夹具行 / VK-FULL 白名单行）。

// M5.2-TENANT-COVERAGE F002 — 会话面入口的租户作用域包裹（口径见 api/actions/route.ts 头注）。
// 【D-4 表态：不涉外呼】setKolContactEmail 只改 Kol.contactEmail + fieldProvenance，
// 全是 DB，用默认事务时长。
//
// 作用域从 setKolContactEmail 起包，**不包 zod 校验与格式归一**：那两步纯计算不碰库，
// 包进去只会白白拉长事务（同 tenant-entry.ts 头注对会话解析的那条理由）。
// 400 路径因此仍然一次库都不碰——「坏格式不依赖库」这个既有性质没被本次接线改掉。
import { z } from 'zod';
import { requireSessionTenantId } from 'lib/auth/session-tenant';
import { withSessionTenant } from 'lib/db/tenant-entry';
import {
  normalizeContactEmailInput,
  setKolContactEmail,
} from 'lib/kols/contact-email';

export const runtime = 'nodejs';

const bodySchema = z.object({
  /** string = 录入（trim 后校验格式）；null / 空串 = 清除 */
  contactEmail: z.union([z.string(), z.null()]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const parsed = bodySchema.safeParse(
      await req.json().catch((): null => null),
    );
    if (!parsed.success) {
      return Response.json(
        { error: 'body 须为 { contactEmail: string | null }' },
        { status: 400 },
      );
    }
    const normalized = normalizeContactEmailInput(parsed.data.contactEmail);
    if (normalized.ok === false) {
      // 坏格式 400 明示（acceptance 2）
      return Response.json({ error: normalized.error }, { status: 400 });
    }

    const tenantId = await requireSessionTenantId();
    const result = await withSessionTenant(() =>
      setKolContactEmail(tenantId, id, normalized.value),
    );
    if (result.ok === false) {
      return Response.json({ error: '创作者不存在' }, { status: 404 });
    }
    return Response.json({ id, contactEmail: result.contactEmail });
  } catch (error) {
    console.error('[api/kols/contact] 失败:', error);
    return Response.json({ error: '录入失败，请重试' }, { status: 500 });
  }
}
