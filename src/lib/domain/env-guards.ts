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
  /** →reach：尚无 status=approved 的 MatchPlan（M2-A F004 真判定，architecture :487） */
  | 'MATCH_PLAN_NOT_APPROVED'
  /** →delivery：尚无 Deal（由 committed quote 生成，M3-B F010 真判定，architecture :488） */
  | 'NO_DEAL_YET'
  /** →insight：仍有 Deal 未收尾（既非 completed 也非 defaulted，M3-B F010，architecture :489） */
  | 'DEALS_NOT_SETTLED'
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
  /**
   * 是否存在 status=approved 的 MatchPlan（→reach 的判据，M2-A F004）。
   * 必填非可选：守卫是安全机制，强迫每个调用方显式查好传入——
   * 可选缺省会把「忘了查」静默降级成拒绝，错在正确一侧但掩盖调用方 bug。
   */
  hasApprovedMatchPlan: boolean;
  /**
   * 是否存在 ≥1 个 Deal（→delivery 的判据，M3-B F010）。
   * Deal 由 commit_quote 在同事务生成（P2），故它等价于「至少有一笔报价被承诺」。
   * 必填非可选，理由同 hasApprovedMatchPlan：不给「忘了查」留静默降级的缝。
   */
  hasDeal: boolean;
  /**
   * 全部 Deal 均已收尾（→insight 的判据，M3-B F010 / P12）：
   * 每个 Deal 都是 `completed` 或 `defaulted`；**零 Deal 时为 true**——
   * 没开始交付的项目不该被交付条件卡在洞察门外（P12 空态诚实，architecture :489「或显式收尾」）。
   */
  allDealsSettled: boolean;
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
 * M3-B F010 起**五条全部真判**：→brief（无条件）· →match（goal）· →reach（approved 组合，
 * M2-A F004）· →delivery（≥1 Deal）· →insight（全部 Deal 收尾或零 Deal）。
 * D9 的占位理由 `DEPENDENCY_NOT_IMPLEMENTED` 随之退役——没有任何分支再返回它。
 */
function transitionGuard(target: Stage, ctx: EnvGuardContext): EnvGuardResult {
  switch (target) {
    case 'brief':
      // 无条件：项目创建即入
      return allow();
    case 'match':
      // brief 目标已确认 —— 本批以 Project.goal 是否解析成功为判据
      return ctx.goal == null ? deny('BRIEF_GOAL_NOT_CONFIRMED') : allow();
    case 'reach':
      // 存在 status=approved 的 MatchPlan（architecture :487；M2-A F004 真判定，
      // 存在性由调用方查好经 ctx 传入——守卫保持纯函数不读 DB）
      return ctx.hasApprovedMatchPlan
        ? allow()
        : deny('MATCH_PLAN_NOT_APPROVED');
    case 'delivery':
      // ≥1 Deal（由 committed quote 生成，architecture :488；M3-B F010 真判定，
      // 存在性由调用方查好经 ctx 传入——守卫保持纯函数不读 DB）
      return ctx.hasDeal ? allow() : deny('NO_DEAL_YET');
    case 'insight':
      // 全部 Deal 到 completed 或显式收尾（defaulted）；零 Deal 亦放行（P12 空态诚实）
      return ctx.allDealsSettled ? allow() : deny('DEALS_NOT_SETTLED');
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
