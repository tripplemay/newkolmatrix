// M4.7-FRONTDESK F001 — 受限子 loop 执行器（专家降为内部能力）
//
// 【它是什么】前台（orchestrator）在一次对话里把某个专业问题交给专家时，
// 不再"把对话让给专家"（M4.5 的 handoff_to 形态 = 用户看着身份横跳），
// 而是在工具 execute 内部起一次**受限的、非流式的**子 loop：目标人格的 system +
// 目标人格的工具子集，跑完把结构化结果交回前台，由前台用一个声音作答。
//
// 这正是 architecture.md:1086「协同交接两种实现形态」表里状态一直为「未实装」的
// 那一列（子 Agent 调用）。
//
// 【时刻隔离照旧，两道防线一道不少】
//   ① activeTools / ToolSet 只装目标人格的工具 —— 模型看不见别人的
//   ② toAiSdkTools 的 isToolActive 在**执行侧**再拦一道 —— 模型凭历史消息里的
//      工具名照样调不到别人的（视野收窄挡不住这种）
// 【闸门照旧】子 loop 里调 outbound 工具走的还是同一个 executeTool，
//   ctx 没有 confirmationToken → 一律停 pending，不因为"是内部子 loop"就放行。

import { generateText, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import { chatModel } from '../ai/gateway';
import { buildLoopSystem } from './system-assembly';
import { gameKnowledgeSection } from './knowledge-context';
import { projectContextSection } from './project-context';
import { getPersona, type AgentId } from './registry';
import { personaToolSubset } from './persona-router';
import type { ToolContext } from './tools/types';

// 【为什么这两个是惰性 import】本模块被 `tools/consult-specialist.ts` 依赖，而后者由
// 装配入口 `tools/index.ts` 在顶层注册。若在此顶层 import `./tools`（装配入口）或
// `./to-ai-sdk-tools`（→ execute → tools/index），就形成
//   tools/index → consult-specialist → specialist-loop → … → tools/index
// 的循环。M4.5 F004 踩过同一个：**vitest / next dev 全绿，只有 `next build` 的
// prerender 阶段 TDZ 崩**（Cannot access 'l' before initialization）。
// 仓内守门 tool-module-cycles.test.ts 当时只查「工具模块直接 import tools/index」，
// 抓不到这种传递链——本批把它升级为传递闭包扫描（见该测试文件）。
// 改成调用时动态 import：模块初始化期不成环，运行期一切已就绪。
async function lazyDeps() {
  const [{ toAiSdkTools }, { ensureNativeToolsRegistered }] = await Promise.all([
    import('./to-ai-sdk-tools'),
    import('./tools'),
  ]);
  return { toAiSdkTools, ensureNativeToolsRegistered };
}

/**
 * 单个专家子 loop 的步数上限。
 *
 * 【为什么是 3】专家只做一件事：读数据 + 给结论。**这个数字是猜的**——
 * 全批验收皆 mock，无真实延迟数据（spec D-3 如实登记）。故做成常量，
 * 上线拿到真实数据改这里一处即可。F006 会把它连同另两个上限收进 registry。
 */
export const SPECIALIST_MAX_STEPS = 3;

/** 深度守卫触发时的消息（测试与前台文案共用锚点）。 */
export const CONSULT_DEPTH_EXCEEDED_MSG =
  '子 loop 内不得再起子 loop（专家不能再咨询专家）';

/** 子 loop 的结构化产物。前台据此作答；不含流。 */
export interface SpecialistLoopResult {
  /** 实际干活的专家。 */
  agentId: AgentId;
  /** 专家的结论正文。 */
  text: string;
  /** 工具调用序列（含重复且保序——子 loop 形状的指纹，只取名字不取入参）。 */
  toolNames: string[];
  steps: number;
  /**
   * 撞步数上限 = 专家没说完（前台必须如实转达，不得假装答完）。
   *
   * 【判据为什么不是 finishReason】AI SDK 7.0.31 的 `generateText` 结果**不暴露**
   * `finishReason`（实测 keys 仅 initialResponseMessages / steps / _output / totalUsage，
   * steps[i].finishReason 同样 undefined）。不报一个填不出来的字段——改用结构判据：
   * 步数用满**且末步仍在要工具** = 被上限截停；末步出文本 = 自然收敛。
   */
  budgetHit: boolean;
}

export interface RunSpecialistLoopParams {
  targetAgent: AgentId;
  /** 前台转述的问题（前台自己的话，不是用户原话的透传）。 */
  question: string;
  /** 前台的 ctx。子 loop 会在其上派生（agentId 换成专家、深度 +1）。 */
  ctx: ToolContext;
  /**
   * 预拼好的项目上下文段 / 知识段。前台已经查过一次的，别让每个专家再各查一遍。
   * 不传则子 loop 自己查（独立调用场景，如测试）。
   */
  projectSection?: string;
  /** 注入缝：测试注入 mock model。**传入即无条件使用**，见下方注释。 */
  model?: LanguageModel;
}

/**
 * 跑一次受限专家子 loop。
 *
 * @throws 深度守卫触发（专家试图再咨询专家）。**不静默吞**——静默会让链路
 *         悄悄变深，成本与延迟失控且无人知晓。
 */
export async function runSpecialistLoop(
  params: RunSpecialistLoopParams,
): Promise<SpecialistLoopResult> {
  const { toAiSdkTools, ensureNativeToolsRegistered } = await lazyDeps();
  ensureNativeToolsRegistered();
  const { targetAgent, question, ctx } = params;

  // ── 深度守卫 ────────────────────────────────────────────────────────────
  // 前台 ctx 的 consultDepth 为空/0；子 loop 内派生为 1。专家手上本就没有
  // consult_specialist（F002 只发给前台），这里是第二道防线：即便将来有人
  // 误把该工具发给别的人格，也不会造出无限嵌套。
  const depth = ctx.consultDepth ?? 0;
  if (depth >= 1) {
    throw new Error(`[specialist-loop] ${CONSULT_DEPTH_EXCEEDED_MSG}`);
  }

  const target = getPersona(targetAgent);
  const toolNames = personaToolSubset(target);

  // 派生 ctx：agentId 换成**实际干活的专家**（留痕归属随之正确，F004 依赖此处），
  // 深度 +1。confirmationToken 不继承——子 loop 不得凭前台的令牌放行 outbound。
  const subCtx: ToolContext = {
    ...ctx,
    agentId: targetAgent,
    consultDepth: depth + 1,
    confirmationToken: undefined,
  };

  const projectSection =
    params.projectSection ??
    (subCtx.projectId ? await projectContextSection(subCtx.projectId) : '');
  const knowledgeSection = subCtx.projectId
    ? await gameKnowledgeSection(subCtx.projectId, target.knowledgeKinds)
    : '';

  const system =
    buildLoopSystem(target, toolNames, knowledgeSection, projectSection) +
    SPECIALIST_SCOPE_CLAUSE;

  const tools = toAiSdkTools(toolNames, subCtx, {
    // 执行侧硬挡。**如实说明：当前这道防线是冗余的**——子 loop 的 ToolSet 本就只装
    // 目标人格的工具（不像 runAgentLoop 里持有 handoff_to 的人格要装并集），
    // 越权调用会先被"工具不存在"挡掉，走不到这里。保留它是为了将来一旦有人放宽
    // ToolSet（例如给子 loop 也装并集）时不至于裸奔。因其当前不可达，**没有**
    // 对应的行为级用例——不写一条测不到它的断言来假装守住了（M4.6 教训）。
    isToolActive: (name) => target.tools.includes(name),
  });

  const result = await generateText({
    // 注入缝纪律（M4 教训）：传入即**无条件使用**，绝不因凭据缺失改道回默认 caller——
    // 否则无凭据环境（CI）下 mock 注入被静默改道，测的不是被测对象。
    model: params.model ?? ctx.model ?? chatModel(),
    system,
    prompt: question,
    tools,
    activeTools: toolNames,
    stopWhen: stepCountIs(SPECIALIST_MAX_STEPS),
  });

  const steps = result.steps.length;
  const lastStep = result.steps[steps - 1];
  return {
    agentId: targetAgent,
    text: result.text,
    toolNames: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
    steps,
    budgetHit:
      steps >= SPECIALIST_MAX_STEPS && (lastStep?.toolCalls.length ?? 0) > 0,
  };
}

/**
 * 子 loop 的附加条款。
 *
 * 前台转述的问题天然是二手的，专家必须按自己的 scope 重读真实数据——
 * 沿用 M4.5 交接条款同一条纪律（不采信上游结论），措辞随"咨询"语义调整。
 */
export const SPECIALIST_SCOPE_CLAUSE = [
  '',
  '',
  '【咨询说明】前台把这个问题转给了你。转述只是线索，不是事实来源：',
  '请按你自己的职责范围（scope）用你的工具**重新读取**真实数据后再作答，',
  '不要采信转述里的任何金额、状态或判断结论。',
  '证据不足就如实说明缺什么，**不要为了把话说圆而给出数值结论**。',
].join('\n');
