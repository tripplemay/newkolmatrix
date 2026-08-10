// M3-A-REACH-CRM F002 — POST /api/actions/[id]/confirm：确认 = 签发一次性执行票（§9.3.2）
//
// 只有人（操盘手）经此端点确认。执行票明文**仅在本响应出现一次**（DB 只存 hash）；
// 副作用不在此发生——须凭票再调 POST /api/actions/[id]/execute 消费。
// 原子条件 UPDATE（WHERE status='pending'）消并发双确认（R15），败者 409。
// 运行时 = nodejs（Prisma）；P9 限流 30/min/IP fail-open。

// 【M5.2-TENANT-COVERAGE F001 — 本路由**刻意不在入口层包**（spec D-3 裁决＝处置③，第二处）】
// 与 execute 同一个理由：confirmPendingAction 里也有「先写后抛」——确认窗过期时它先把
// pending 惰性翻成 expired，紧接着抛 GATE_EXPIRED。入口层一包，那次翻转随抛错回滚。
// 探针实测（同一条 confirmPendingAction，只换外层有无作用域）：
//   裸调         → 翻转后 status=expired（今天的行为）
//   外层有作用域 → 翻转后 status=pending（翻转被回滚带走）
// gate:smoke 的 G6「确认窗过期惰性翻转 pending → expired」实测会因此翻红。
// 逐个核过：list / detail / reject 三条无此结构，仍在入口层包。判据见
// tests/integration/m52-f001-gate-scope.test.ts §5。
import { buildToolContext } from 'lib/agent/context';
import { confirmPendingAction } from 'lib/agent/gate/gate';
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
    const ctx = await buildToolContext();
    const result = await confirmPendingAction(id, ctx);
    return Response.json(result);
  } catch (error) {
    return gateErrorResponse(error);
  }
}
