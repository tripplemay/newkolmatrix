// ARCH-M05 F010 → M3-A-REACH-CRM F008 — Reach 环节语法面：三栏对话收件箱接真（V6，converse 语法）。
// 挂载契约（F007 静态映射 + F008 真数据分支）：default export + { projectId, data }；
// 数据 = RSC 组装的 ReachSurfaceData（lib/reach/surface-data，mock/env-reach.ts 已退役）。
// 五套语法互不相同（D8/FR-7.10）——本面聚焦一个人（左人列/中对话+草稿/右档案），
// 与 Match 的横向对比矩阵刻意相反。主体在 ./ConversationInbox（🚪 真闸门两步票据链路）。

import ConversationInbox from './ConversationInbox';
import {
  EMPTY_REACH_SURFACE,
  type ReachSurfaceData,
} from 'lib/display/reach-format';

// data 可选（缺省空表）：满足 ENV_SURFACE 静态映射的 { projectId } 挂载契约类型；
// 实际渲染恒经 ProjectDetail 的 reach 显式分支传真数据（MatchEnv 同款先例）。
export default function ReachEnv({
  projectId,
  data = EMPTY_REACH_SURFACE,
}: {
  projectId: string;
  data?: ReachSurfaceData;
}) {
  return <ConversationInbox projectId={projectId} data={data} />;
}
