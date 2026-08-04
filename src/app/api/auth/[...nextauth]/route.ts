// M5-AUTH-RLS F001（spec D-1）— Auth.js v5 路由装配：/api/auth/*
//
// 覆盖 signin / callback / signout / session / csrf / providers 全部内建端点。
// runtime=nodejs：authorize 走 bcrypt + Prisma（edge 不可用）。
// 本路径在 F003 middleware 的豁免清单内——未登录必须可达，否则登录本身被自己的闸门拦住。
// 注意：/api/auth/register（F005 注册端点）是**静态段**，Next 路由优先级高于本 catch-all，
// 不会被这里吞掉。

import { handlers } from 'lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = handlers;
