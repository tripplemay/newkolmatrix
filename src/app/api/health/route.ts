// GO-LIVE F001 — 轻量存活探针（容器 healthcheck 目标）
//
// 纯 liveness：只证 app 进程在服务 HTTP，返回 200 {ok:true}。不查 DB/网关
// （DB 就绪由 compose depends_on: db healthy 保证；避免瞬态 DB 抖动误判 app unhealthy）。
// 取代原 compose healthcheck 命中的 /admin/dashboards/default —— F008 后该路由 redirect 到
// /admin/today 返回 307 ≠ 200，会让 healthcheck 恒失败（D-GL5）。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true }, { status: 200 });
}
