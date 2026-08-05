// M5-AUTH-RLS F003（spec D-2）— 全站鉴权边界（从零建）。
//
// 职责边界：**只判「有没有合法会话」这一件事**。谁能看哪个租户的哪行数据不在这里判——
// 那是数据层 RLS（F008/F009）的事；middleware 里做细粒度授权只会造出第二套半吊子权限系统。
//
// 装配说明：
//  - 用 lib/auth/config 的 **edge-safe 基座**另建一个 NextAuth 实例，**不**从 lib/auth/index 导入。
//    后者带 Credentials provider（bcrypt + Prisma），middleware 默认跑 edge runtime，
//    把它们拖进来会直接构建失败。这里只需要 auth() 解 JWT cookie，零 provider 足够。
//  - 这里用**静态配置对象**建实例（与 lib/auth/index 的函数式配置不同）：next-auth 的 lazy 形态下
//    `auth` 本身是 async 函数，`auth(handler)` 返回的是 **Promise 而不是函数**，Next 会当场报
//    「Middleware must export a `middleware` or a `default` function」（本机实测踩到）。
//    edge 模块作用域在请求时才求值，故 `next build` 不会因缺 AUTH_SECRET 失败（已实测）；
//    生产缺 secret 时每个请求抛错 = fail-closed，与 API 面同语义。
//  - 判定与响应构造全在 lib/auth/access-policy（纯函数，单测直驱）；本文件只做拆装。
//
// matcher 取**默认全拦 + 负向排除**形态（而非列举要拦的路径）：新加的路由默认被守住，
// 忘记登记不会造成静默失守。排除项只有 Next 构建产物与 public/ 下的真实静态文件。
//
// ⚠️ 排除项**必须与 access-policy 的 public-asset 规则同步收窄**（I-1）：
// 早先这里写的是「任何以某扩展名结尾的路径」，middleware 因此对 `/api/actions/abc.json`
// 这类路径**根本不执行**——闸门被一个后缀绕过。现在扩展名排除只在
// `img|fonts|svg|styles` 四个 public/ 目录内生效，另加三个 public/ 顶层单文件（各自 `$` 锚定）。
// 两层的一致性由单测钉住：`matcher 排除的路径 ⊆ 豁免清单放行的路径`，且 public/ 下每个真实文件
// 两层都必须放行（tests/unit/auth-middleware-gate.test.ts ③）。

import NextAuth from 'next-auth';
import { authBaseConfig, resolveAuthSecret } from 'lib/auth/config';
import {
  authGateResponse,
  resolveRequestOrigin,
} from 'lib/auth/access-policy';

const { auth } = NextAuth({
  ...authBaseConfig,
  secret: resolveAuthSecret(),
});

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  return (
    authGateResponse({
      pathname,
      search,
      isLoggedIn: Boolean(req.auth?.user),
      // 对外 origin 从请求头推导：nextUrl.origin 在 standalone 下恒是监听地址（反代后必断）
      origin: resolveRequestOrigin(req.headers, req.nextUrl.origin),
    }) ?? undefined
  );
}) as unknown as (req: Request) => Promise<Response | undefined>;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico$|manifest\\.json$|robots\\.txt$|(?:img|fonts|svg|styles)/.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|css|txt|xml|webmanifest|json)$).*)',
  ],
};
