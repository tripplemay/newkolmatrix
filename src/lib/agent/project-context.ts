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
 * 抽成导出供后续复用：新代码一律走这里，不再各写一遍。
 *
 * 【M4.8-HARDEN F001：tenantId 是必选参数，不是可选】此前本函数**无 tenantId 条件**，
 * 而 `copilot.projectId` 是客户端可控的（route.ts 直接取 `body.context.projectId`
 * 不校验归属）——M4.6 验收实测可让 system 段吐出**另一个租户的项目名**。单租户 dev
 * 下没有实际影响，但它是「新代码一律走这里」的可复用口径，任何持有 ctx 的调用方复用
 * 即静默丢掉租户隔离。
 *
 * 做成必选（无默认值）是刻意的：可选参数 = 留一道静默门——漏传的调用点照样编译通过，
 * 于是缺陷以「某个新调用点忘了传」的形式复发。必选则由 tsc 保证全调用点显式传。
 *
 * 跨租户 ref 的行为 = **视同不存在**（返回 null），沿用下方降级纪律：段落只写 id，
 * 名字不出现。不抛错、不打死会话。
 */
export async function findProjectByRef(
  ref: string,
  tenantId: string,
): Promise<{ id: string; name: string } | null> {
  return prisma.project.findFirst({
    where: {
      tenantId,
      OR: [{ id: ref }, { publicId: ref }, { slug: ref }],
    },
    select: { id: true, name: true },
  });
}

/**
 * 当前项目上下文段。`projectId` 为空时调用方不该调本函数（工作区层页面不注水，
 * 与知识段同款空值纪律）。
 *
 * 降级：取名失败（DB 故障 / 项目不存在 / **跨租户 ref**）→ **只写 id，不编造名字**，
 * 段落照常注入。项目标识本身来自 ctx，不依赖 DB；只有「名字」需要查库。所以取名失败
 * 不该让模型退回到「反问用户」的老路，更不该把整个会话打死（同知识段 D2 纪律：
 * 增强性注入不得打死主链路）。
 *
 * `tenantId` 必选（M4.8-HARDEN F001）：跨租户的 projectId 走「查不到」这条既有降级路径，
 * 于是别的租户的项目**名字**永远不会进 system 段。
 */
export async function projectContextSection(
  projectId: string,
  tenantId: string,
): Promise<string> {
  let name: string | null = null;
  let resolvedId = projectId;
  try {
    const project = await findProjectByRef(projectId, tenantId);
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
