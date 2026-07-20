// FE-REFACTOR F001 — 对话气泡（还原设计稿 .cmsg：user 渐变右 / agent 浅色左）。
// 收敛 6 处手写气泡（CopilotPanel ×4 + agent-canvas 预览 ×2）；muted 对应「正在思考…」态。

import React from 'react';

export interface ChatBubbleProps {
  role: 'user' | 'agent';
  muted?: boolean;
  children: React.ReactNode;
}

const USER_BUBBLE =
  'max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand-400 to-brand-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white';
// FE-REFACTOR F004：去 shadow-sm（模板生产代码零次词表），agent 气泡以 bg 与底色分界
const AGENT_BUBBLE =
  'max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-navy-700 dark:bg-navy-700 dark:text-white';
const AGENT_MUTED_BUBBLE =
  'rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] text-gray-400 dark:bg-navy-700';

export default function ChatBubble({ role, muted, children }: ChatBubbleProps) {
  const isUser = role === 'user';
  const bubble = isUser
    ? USER_BUBBLE
    : muted
    ? AGENT_MUTED_BUBBLE
    : AGENT_BUBBLE;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={bubble}>{children}</div>
    </div>
  );
}
