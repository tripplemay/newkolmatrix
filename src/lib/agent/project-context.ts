// M4.6-CTX F001 — 当前项目上下文注入（system 装配第 ② 段）
//
// 【为什么需要它】ctx.projectId 由服务端解析（CopilotPanel.deriveContext → resolveContext
// → buildToolContext），工具执行时也拿得到；但它**从未进入 system 段**——模型看不见。
// 而 13 个工具把 projectId 当**模型入参**（match_plan / compute_roi / draft_report /
// propose_plan / check_compliance …），于是模型无从得知，只能反问用户「请提供项目ID」。
// 生产实测复现（M4+M4.5 上线首轮真实对话，项目环节页）。
//
// 【为什么测试没抓到】mock-model 测试床里工具入参是脚本写死的
//（`toolCalls: [{ toolName: 'match_plan', input: { projectId: fx.id } }]`），
// 模型从不需要「自己发现」projectId——这条缺口正落在测试床的结构性盲区里。
//
// 【范围】只注入项目身份。环节 / env 不在本批（那是另一件事）。
// 不动任何工具的入参契约——13 个工具的 zod schema 保持原样，柱一契约零改动。

import { prisma } from '../db/prisma';

/** 拼进 system 的指令句——单测钉它，防后续改文案时把「不要索要」这层保证丢掉。 */
export const NO_ASK_PROJECT_CLAUSE =
  '需要 projectId 入参的工具，直接使用上面这个项目标识，不要向用户索要项目 ID——用户就在这个项目的页面上，他不该被反问自己已经打开的东西。';

/** 段落起始锚点（测试与 grep 用）。 */
export const PROJECT_CONTEXT_HEADING = '【当前上下文】';

/**
 * 三口径解析（id / publicId / slug）—— 与知识段、match_plan、compute_health 同款口径。
 *
 * 抽成导出供后续复用：仓内目前另有三处内联同款 OR（`knowledge-context.ts:62`
 * `match-plan.ts:61` `compute-health.ts` D8 先例）。本批不改那三处（bug 修复批次
 * 范围克制），登记为 soft-watch；新代码一律走这里，不再各写一遍。
 */
export async function findProjectByRef(
  ref: string,
): Promise<{ id: string; name: string } | null> {
  return prisma.project.findFirst({
    where: { OR: [{ id: ref }, { publicId: ref }, { slug: ref }] },
    select: { id: true, name: true },
  });
}

/**
 * 当前项目上下文段。`projectId` 为空时调用方不该调本函数（工作区层页面不注水，
 * 与知识段同款空值纪律）。
 *
 * 降级：取名失败（DB 故障 / 项目不存在）→ **只写 id，不编造名字**，段落照常注入。
 * 项目标识本身来自 ctx，不依赖 DB；只有「名字」需要查库。所以取名失败不该让模型
 * 退回到「反问用户」的老路，更不该把整个会话打死（同知识段 D2 纪律：增强性注入
 * 不得打死主链路）。
 */
export async function projectContextSection(projectId: string): Promise<string> {
  let name: string | null = null;
  let resolvedId = projectId;
  try {
    const project = await findProjectByRef(projectId);
    if (project) {
      resolvedId = project.id;
      name = project.name;
    }
  } catch (error) {
    console.warn(
      '[agent/project-context] 项目名取数失败，降级为只写 id:',
      error,
    );
  }
  const label = name ? `${resolvedId}（${name}）` : resolvedId;
  return [
    '',
    '',
    `${PROJECT_CONTEXT_HEADING}用户正在项目 ${label} 的页面上与你对话。`,
    NO_ASK_PROJECT_CLAUSE,
  ].join('\n');
}
