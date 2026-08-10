// M4.5-AGENT-LOOP F007 — GET /api/actions：待确认动作清单（只读）
//
// 供 CopilotPanel 的「已备好 N 件待确认」聚合卡取数（今天页是 RSC 直读，不经此端点）。
// 与 GET /api/actions/[id] 同口径：只回 harm 披露与状态，**不含** inputJson / 任何 hash / 票据。
//
// 【边界】本端点是**只读**的。批量确认没有对应端点——聚合卡的「依次确认」是前端逐项调
// 既有 /api/actions/{id}/confirm + /execute（见 lib/gate/batch-confirm.ts 文件头）。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

// M5.2-TENANT-COVERAGE F001 — 会话面入口的租户作用域包裹（样板：api/nav-badges/route.ts）。
//
// ctx 在 withSessionTenant **之外**构造：零参 buildToolContext 只解 JWT、不碰库
// （lib/agent/context.ts 的双路收敛），放进回调里等于先占一条连接开着事务再去解 cookie
// ——tenant-entry.ts 头注点名要避的那种拉长。租户由 withSessionTenant 自己再解一次会话拿到；
// **不得**改成由调用方把租户当入参传给它（那等于把租户交给用户请求决定，
// tests/unit/session-tenant-context.test.ts 的普查钉扫 src/app/** 会点名）。
//
// 【本段刻意不写出那个「传租户」调用的字面形态】上面那道钉是**源码级**扫描，不剔注释：
// 初版把违规写法照字面写进注释，本文件当场被自己点名（实测 offenders 列出本文件）。
// 同一个坑普查模块也踩过并留了记录（scripts/test/m51b-entrypoint-census.ts 的 SELF 段）。
// F002–F007 照抄本头注时**连这条一起照抄**，别把反例写成字面量。
import { buildToolContext } from 'lib/agent/context';
import { actionsRateLimitGuard, gateErrorResponse } from 'lib/agent/gate/http';
import { aggregatePending } from 'lib/agent/orchestrator';
import { withSessionTenant } from 'lib/db/tenant-entry';
import { toPendingBatchItems } from 'lib/gate/pending-items';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const limited = actionsRateLimitGuard(req);
  if (limited) return limited;
  try {
    const ctx = await buildToolContext();
    const pending = await withSessionTenant(() => aggregatePending(ctx));
    return Response.json({ items: toPendingBatchItems(pending) });
  } catch (error) {
    return gateErrorResponse(error);
  }
}
