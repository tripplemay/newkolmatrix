// M1-A-BRIEF F005 — 五环节流转守卫（architecture.md:481 标注为演进目标归 M1；
// :563 要求页面与工具层双重执行——本批做服务端这一半，页面半边归 M1-B）。
//
// 形态按 D7：kebab-case 文件名 + 具名导出。纯函数，不读 DB：
// 判据所需的一切（游标、目标）由调用方查好后传入，守卫只负责判定。
//
// ⚠️ 守卫是安全机制，不是文案。任何「验不了前置条件」的分支一律 fail-safe 拒绝，
//    绝不返回 true —— 返回 true 的守卫就是假守卫，正是 PRD :129 点名的反模式
//    「只有文案的阶段门」。

import { STAGES, type Stage } from 'lib/agent/stage-routing';
import type { ProjectGoal } from 'lib/data/schemas/project';

/**
 * 拒绝理由（D8）。
 *
 * **必须是字符串字面量联合**，不是自由文本、也不是 i18n key：
 * - 自由文本无法在工具层做分支（ADR-16 要求本守卫在页面渲染 / 工具层 / 例程三处复用）
 * - i18n key 会把展示层耦合进领域层
 * 文案映射留在展示层（M1-B）。
 */
export type EnvGuardReason =
  /** 目标环节尚未解锁（FR-7.9：可回看已解锁，不可跳未解锁） */
  | 'STAGE_NOT_UNLOCKED'
  /** →match：brief 目标尚未确认 */
  | 'BRIEF_GOAL_NOT_CONFIRMED'
  /**
   * D9 保守拒绝：该流转的前置依赖表本批尚未建，验不了。
   *
   * 与真实业务拒绝理由**刻意可区分** —— M2 建 MatchPlan、M3 建 Deal 时，
   * 直接 grep 这个字面量就能定位到所有待替换的分支，不会漏。
   */
  | 'DEPENDENCY_NOT_IMPLEMENTED'
  /** 已在末环节，无可推进 */
  | 'ALREADY_AT_FINAL_STAGE'
  /** 双值不变量被破坏：状态本身不可信，任何流转都不予放行 */
  | 'INVARIANT_VIOLATED';

/** 守卫返回结构（D8）。 */
export interface EnvGuardResult {
  allowed: boolean;
  reason: EnvGuardReason | null;
}

/** 守卫判定所需的项目状态。调用方查好传入，守卫不读 DB。 */
export interface EnvGuardContext {
  /** 当前环节 */
  cur: Stage;
  /** 历史最远解锁位（D2 双值） */
  maxReached: Stage;
  /** `Project.goal` 的解析结果。null = 目标未确认（→match 的判据） */
  goal: ProjectGoal | null;
}

const allow = (): EnvGuardResult => ({ allowed: true, reason: null });
const deny = (reason: EnvGuardReason): EnvGuardResult => ({
  allowed: false,
  reason,
});

/** 环节序号。非法取值返回 -1。 */
export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/**
 * D2 双值不变量：`curIdx <= maxReachedIdx`。
 *
 * 双值（`cur` + `maxReached`）换来了 cur 回退能力，代价就是这条一致性约束——
 * 不守住它，「已解锁到哪」和「现在在哪」会各说各话。
 * 独立导出：既供守卫内部前置校验，也供写入方（F006 推进函数）落库前自检。
 */
export function isStageInvariantHeld(cur: Stage, maxReached: Stage): boolean {
  const c = stageIndex(cur);
  const m = stageIndex(maxReached);
  if (c < 0 || m < 0) return false; // 非法环节值
  return c <= m;
}

/**
 * 能否**进入**某环节（FR-7.9：可回看已解锁的，不可跳到未解锁的）。
 *
 * 注意与 `canAdvance` 的分工：进入是「看」，推进是「改」。
 * 回看 brief 不需要满足 →match 的业务条件，故这里只查解锁范围。
 */
export function canEnter(ctx: EnvGuardContext, target: Stage): EnvGuardResult {
  if (!isStageInvariantHeld(ctx.cur, ctx.maxReached)) {
    return deny('INVARIANT_VIOLATED');
  }
  const t = stageIndex(target);
  if (t < 0) return deny('STAGE_NOT_UNLOCKED'); // 非法目标一律拒
  // → brief 无条件（architecture.md:484「项目创建即入」）；它恒为 index 0，
  // 天然满足下面这条比较，无需特例分支。
  if (t > stageIndex(ctx.maxReached)) return deny('STAGE_NOT_UNLOCKED');
  return allow();
}

/**
 * 五条流转的业务前置条件（architecture.md:483-489）。
 *
 * 只有 `→brief`（无条件）与 `→match`（可由 `goal` 判定）在本批**真正可判**；
 * 其余三条的依赖表尚未建，按 D9 一律保守拒绝。
 */
function transitionGuard(
  target: Stage,
  ctx: EnvGuardContext,
): EnvGuardResult {
  switch (target) {
    case 'brief':
      // 无条件：项目创建即入
      return allow();
    case 'match':
      // brief 目标已确认 —— 本批以 Project.goal 是否解析成功为判据
      return ctx.goal == null ? deny('BRIEF_GOAL_NOT_CONFIRMED') : allow();
    case 'reach':
      // 依赖 status=approved 的 MatchPlan —— M2 建表
      return deny('DEPENDENCY_NOT_IMPLEMENTED');
    case 'delivery':
      // 依赖 >=1 Deal（由 committed quote 生成）—— M3 建表
      return deny('DEPENDENCY_NOT_IMPLEMENTED');
    case 'insight':
      // 依赖全部 Deal 到 completed 或显式收尾 —— M3 建表
      return deny('DEPENDENCY_NOT_IMPLEMENTED');
  }
}

/**
 * 能否把 `cur` **推进**到下一环节。
 *
 * 与 `canEnter` 的区别：这里要验目标环节的业务前置条件，而非解锁范围——
 * 推进本身就是「把解锁范围往前拓一格」的动作。
 */
export function canAdvance(ctx: EnvGuardContext): EnvGuardResult {
  if (!isStageInvariantHeld(ctx.cur, ctx.maxReached)) {
    return deny('INVARIANT_VIOLATED');
  }
  const next = nextStage(ctx.cur);
  if (next == null) return deny('ALREADY_AT_FINAL_STAGE');
  return transitionGuard(next, ctx);
}

/** `cur` 的下一环节；已在末环节返回 null。 */
export function nextStage(cur: Stage): Stage | null {
  const i = stageIndex(cur);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

/**
 * 抬升后的 `maxReached`：取两者较大者，保证**单调不减**（D2）。
 * 独立导出供 F006 推进函数复用——单调性只在这一处实现，不散落。
 */
export function raiseMaxReached(maxReached: Stage, target: Stage): Stage {
  return stageIndex(target) > stageIndex(maxReached) ? target : maxReached;
}
