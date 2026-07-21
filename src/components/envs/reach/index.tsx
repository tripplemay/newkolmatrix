// ARCH-M05 F010 — Reach 环节语法面：三栏对话收件箱（V6 24 元素，converse 语法）。
// 挂载契约（F007）：default export + { projectId }；五套语法互不相同（D8/FR-7.10）——
// 本面聚焦一个人（左人列/中对话+草稿/右档案），与 Match 的横向对比矩阵刻意相反。
// 主体在 ./ConversationInbox（含 🚪 send_outreach / commit_quote 两处 GateConfirm 接线，D6 mock 流）。

import ConversationInbox from './ConversationInbox';

export default function ReachEnv({ projectId }: { projectId: string }) {
  return <ConversationInbox projectId={projectId} />;
}
