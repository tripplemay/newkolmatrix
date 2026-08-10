// M3-A-REACH-CRM F002 — POST /api/actions/[id]/execute { ticket }：消费执行票并执行（§9.3.2）
//
// 原子条件 UPDATE（WHERE status='confirmed' AND ticketUsedAt IS NULL AND ticketExpiresAt>now()）
// 消并发双消费 / 票重放（R15），败者 409。副作用成功 → 同一事务 executed + irrev + 业务态变更；
// 失败 → failed、无 irrev 行。运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。
//
// 【M5.2-TENANT-COVERAGE F001 — 本路由**刻意不在入口层建立租户作用域**（spec D-3 裁决＝处置③）】
//
// 【本段刻意不写出入口层那个包裹函数的名字】入口普查（scripts/test/m51b-entrypoint-census.ts）
// 判「已覆盖」是**源码级**扫描、不剔注释：初版这里照字面写了它，普查当场把本文件误判成
// 已覆盖（实测已覆盖 8，实际应为 7），直接把批次的覆盖数虚报高一条。
// 同族的坑本批已踩到第三次（另两处见 api/actions/route.ts 头注与普查模块的 SELF 段）。
//
// 同批 actions 域另 3 条 route 在入口层包，本条与 confirm 把作用域下沉进领域层。
// 理由不是「改动面小」，是入口层包会**拆掉闸门的一条不变量**：executePendingAction 是三段
// 独立事务（①认领 → ②副作用+收尾 → ③失败收尾），③ 段设计上就指望它活过 ② 的回滚。
// 入口层一包，三段合并成一个事务，③ 随 rethrow 一起回滚。开关开着真连 kol_app 实测对照：
//   作用域下沉    → status=failed     ticketUsedAt=已消费          failed留痕=1  irrev残留=0
//   入口层单事务  → status=confirmed  ticketUsedAt=null（票可重放）  failed留痕=0
// 即入口层包会让 `status='failed'` 丢失、一次性执行票变回可重放。
// 判据钉在 tests/integration/m52-f001-gate-scope.test.ts（含「入口层单事务会丢」的对照组）。
//
// 代价已登记：本文件不含包裹字面量 → 入口普查判它「未覆盖」（spec §2.3 的 55/23 那个 1）。
// 隔离不打折——execute 路径每一次数据访问仍在 withTenant 内，只是作用域不在本文件里。

import { buildToolContext } from 'lib/agent/context';
import { executePendingAction } from 'lib/agent/gate/gate';
import { actionsRateLimitGuard, gateErrorResponse } from 'lib/agent/gate/http';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = actionsRateLimitGuard(req);
  if (limited) return limited;
  try {
    const { id } = await params;
    const body = (await req.json().catch((): null => null)) as {
      ticket?: unknown;
    } | null;
    const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
    if (!ticket) {
      return Response.json(
        { code: 'GATE_TOKEN_INVALID', error: '缺少执行票 ticket' },
        { status: 403 },
      );
    }
    const ctx = await buildToolContext();
    const result = await executePendingAction(id, ticket, ctx);
    return Response.json(result);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
