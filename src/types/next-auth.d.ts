// M5-AUTH-RLS F001（spec D-1）— Auth.js 类型增广：JWT / Session 携带 { userId, tenantId }。
//
// 顺带作 beta 依赖的 ambient 兜底（framework/patterns/web-runtime-patterns.md §1）：
// next-auth 装的是 5.0.0-beta.32（v5 未出正式版，Credentials + JWT 是官方推荐路径）。
// 这里只**增广**官方类型（declare module 合并），不整包 shim —— next-auth 的公共 surface
// 太大，整包替身反而会在 upstream 类型正常解析时把真类型盖掉。版本已 --save-exact 钉死，
// 跨 npm ci 解析确定；若某次 upstream 类型漂移导致 tsc 红，按 §1 在此文件补最小 declare。

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      /** User.id（JWT userId 透出）。 */
      id: string;
      /** 会话租户（F004 buildToolContext 的唯一租户来源）。 */
      tenantId: string;
    } & DefaultSession['user'];
  }

  /** authorize 返回值：在标准 User 上带 tenantId。 */
  interface User {
    tenantId?: string;
  }
}

// JWT 必须augment `@auth/core/jwt` 而非 `next-auth/jwt`：后者只是 `export * from "@auth/core/jwt"`
// 的转发壳，对它 declare module 会新建一个同名接口而非与真身合并——实测症状是
// `token.userId` 仍解析成 Record<string, unknown> 的 `unknown`，tsc 在 config.ts 报 TS2322。
declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string;
    tenantId?: string;
  }
}
