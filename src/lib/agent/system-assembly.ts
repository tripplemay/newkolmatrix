// M4.7-FRONTDESK F002 — system 段装配（从 loop.ts 抽出）
//
// 【为什么抽出来】`consult_specialist`（工具）→ `specialist-loop` → 装配函数。
// 装配函数原先住在 `loop.ts` 里，而 `loop.ts` 顶层 import 装配入口 `tools/index`，
// 于是形成 tools/index → consult-specialist → specialist-loop → loop → tools/index
// 的循环。M4.5 F004 踩过同族的坑：**vitest / next dev 全绿，只有 `next build` 的
// prerender 阶段 TDZ 崩**。
//
// 本次是升级后的传递闭包守门（tool-module-cycles.test.ts）当场抓出来的——
// 而彼时 `npm run build` 恰好是绿的。求值顺序今天安全不代表明天安全，故按守门
// 的判据断干净，不赌运气。
//
// 本模块只依赖 `tools/registry`（低层注册表，无副作用、无反向依赖），不碰装配入口。

import { NO_TOOL_CLAUSE, type AgentPersona } from './registry';
import { getTool } from './tools/registry';

/**
 * 系统提示 = 人格（身份 + 职责 + 否定式护栏）+ **当前项目上下文段**（M4.6 F001）
 * + ⑤层知识段 + 该人格可用工具的使用指引。
 * 无工具人格走 NO_TOOL_CLAUSE 分支（M2-C F003：明示「未执行任何动作」+ 指路，防幻觉执行）。
 *
 * projectSection 在 ctx.projectId 为空时是空串（工作区层页面不注水，同知识段纪律）。
 */
export function buildLoopSystem(
  persona: AgentPersona,
  toolNames: string[],
  knowledgeSection: string,
  projectSection = '',
): string {
  const toolLines = toolNames
    .map((name) => {
      const t = getTool(name);
      return t ? `- ${name}: ${t.description}` : null;
    })
    .filter(Boolean);
  return (
    persona.systemPrompt +
    projectSection +
    knowledgeSection +
    (toolLines.length
      ? `\n\n你可调用的工具（需要时主动调用，基于返回的真实数据作答）：\n${toolLines.join(
          '\n',
        )}`
      : NO_TOOL_CLAUSE)
  );
}
