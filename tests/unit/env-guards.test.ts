// M1-A-BRIEF F005 — domain/env-guards.ts 单测 + 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6）：断言验【行为】不验源码关键字，
// 且必须证明检测器活性——把不变量反转后，同一组断言必须翻红。
// 若变异体也能全过，说明这组断言根本没在测不变量。

import { describe, it, expect } from 'vitest';
import {
  canEnter,
  canAdvance,
  isStageInvariantHeld,
  raiseMaxReached,
  nextStage,
  stageIndex,
  type EnvGuardContext,
  type EnvGuardResult,
} from '../../src/lib/domain/env-guards';
import { STAGES, type Stage } from '../../src/lib/agent/stage-routing';
import type { ProjectGoal } from '../../src/lib/data/schemas/project';

const GOAL: ProjectGoal = {
  targetExposure: 3_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

function ctx(over: Partial<EnvGuardContext> = {}): EnvGuardContext {
  return { cur: 'brief', maxReached: 'brief', goal: GOAL, ...over };
}

describe('canEnter：可回看已解锁，不可跳未解锁（FR-7.9）', () => {
  it('目标 = maxReached → 放行', () => {
    expect(canEnter(ctx({ cur: 'reach', maxReached: 'reach' }), 'reach')).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('目标 < maxReached（回看已解锁）→ 放行', () => {
    const r = canEnter(ctx({ cur: 'reach', maxReached: 'reach' }), 'brief');
    expect(r.allowed).toBe(true);
  });

  it('目标 > maxReached（跳未解锁）→ 拒绝且理由为 STAGE_NOT_UNLOCKED', () => {
    const r = canEnter(ctx({ cur: 'brief', maxReached: 'brief' }), 'insight');
    expect(r).toEqual({ allowed: false, reason: 'STAGE_NOT_UNLOCKED' });
  });

  it('brief 恒可进入（架构 :484 项目创建即入）', () => {
    for (const s of STAGES) {
      const r = canEnter(ctx({ cur: s, maxReached: s }), 'brief');
      expect(r.allowed).toBe(true);
    }
  });

  it('逐环节穷举：解锁到 k 时，恰好 0..k 可进入、k+1..末 全拒', () => {
    STAGES.forEach((maxReached, k) => {
      STAGES.forEach((target, t) => {
        const r = canEnter(ctx({ cur: maxReached, maxReached }), target);
        expect(r.allowed, `maxReached=${maxReached} target=${target}`).toBe(
          t <= k,
        );
      });
    });
  });

  it('非法目标环节 → 拒绝（不放行未知取值）', () => {
    const r = canEnter(ctx(), 'nope' as Stage);
    expect(r.allowed).toBe(false);
  });
});

describe('canAdvance：五条流转的业务前置条件（architecture.md:483-489）', () => {
  it('brief→match：goal 已确认 → 放行', () => {
    const r = canAdvance(ctx({ cur: 'brief', maxReached: 'brief', goal: GOAL }));
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it('brief→match：goal 未确认 → 拒绝，理由 BRIEF_GOAL_NOT_CONFIRMED', () => {
    const r = canAdvance(ctx({ cur: 'brief', maxReached: 'brief', goal: null }));
    expect(r).toEqual({ allowed: false, reason: 'BRIEF_GOAL_NOT_CONFIRMED' });
  });

  it('末环节 insight 无可推进 → ALREADY_AT_FINAL_STAGE', () => {
    const r = canAdvance(ctx({ cur: 'insight', maxReached: 'insight' }));
    expect(r).toEqual({ allowed: false, reason: 'ALREADY_AT_FINAL_STAGE' });
  });
});

describe('D9：依赖表未建的三条一律保守拒绝，绝不返回 true', () => {
  // 逐条实测（acceptance 明令「逐条实测返回 false，不得有任一条返回 true」）
  const D9_TRANSITIONS: Array<{ from: Stage; to: Stage; dep: string }> = [
    { from: 'match', to: 'reach', dep: 'MatchPlan（M2 建表）' },
    { from: 'reach', to: 'delivery', dep: 'Deal（M3 建表）' },
    { from: 'delivery', to: 'insight', dep: 'Deal 收尾（M3 建表）' },
  ];

  for (const { from, to, dep } of D9_TRANSITIONS) {
    it(`${from}→${to} 依赖 ${dep} → allowed=false 且理由 DEPENDENCY_NOT_IMPLEMENTED`, () => {
      const r = canAdvance(ctx({ cur: from, maxReached: from, goal: GOAL }));
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('DEPENDENCY_NOT_IMPLEMENTED');
    });
  }

  it('即使 goal 齐备也不放行——保守拒绝不因无关条件满足而松动', () => {
    for (const { from } of D9_TRANSITIONS) {
      const r = canAdvance(ctx({ cur: from, maxReached: from, goal: GOAL }));
      expect(r.allowed, `${from} 不得放行`).toBe(false);
    }
  });

  it('三条的理由与真实业务拒绝理由可区分（供 M2/M3 逐条替换时 grep 定位）', () => {
    const businessDeny = canAdvance(
      ctx({ cur: 'brief', maxReached: 'brief', goal: null }),
    );
    const depDeny = canAdvance(ctx({ cur: 'match', maxReached: 'match' }));
    expect(businessDeny.reason).not.toBe(depDeny.reason);
  });

  it('全环节穷举：canAdvance 只在 brief→match 且 goal 齐备时放行，其余一律拒', () => {
    for (const from of STAGES) {
      const r = canAdvance(ctx({ cur: from, maxReached: from, goal: GOAL }));
      expect(r.allowed, `cur=${from}`).toBe(from === 'brief');
    }
  });
});

describe('D2 双值不变量：curIdx <= maxReachedIdx', () => {
  it('合法态（cur <= maxReached）判定成立', () => {
    expect(isStageInvariantHeld('brief', 'insight')).toBe(true);
    expect(isStageInvariantHeld('reach', 'reach')).toBe(true);
  });

  it('非法态（cur > maxReached）判定不成立', () => {
    expect(isStageInvariantHeld('insight', 'brief')).toBe(false);
    expect(isStageInvariantHeld('delivery', 'match')).toBe(false);
  });

  it('非法环节取值判定不成立（不静默当合法）', () => {
    expect(isStageInvariantHeld('nope' as Stage, 'brief')).toBe(false);
    expect(isStageInvariantHeld('brief', 'nope' as Stage)).toBe(false);
  });

  it('不变量被破坏时，两个守卫都拒绝放行（状态不可信即全拒）', () => {
    const broken = ctx({ cur: 'insight', maxReached: 'brief' });
    expect(canEnter(broken, 'brief')).toEqual({
      allowed: false,
      reason: 'INVARIANT_VIOLATED',
    });
    expect(canAdvance(broken)).toEqual({
      allowed: false,
      reason: 'INVARIANT_VIOLATED',
    });
  });
});

describe('maxReached 单调不减（D2）', () => {
  it('目标更远 → 抬升到目标', () => {
    expect(raiseMaxReached('brief', 'reach')).toBe('reach');
  });

  it('目标更近 → 保持原值，绝不回落', () => {
    expect(raiseMaxReached('insight', 'brief')).toBe('insight');
    expect(raiseMaxReached('reach', 'match')).toBe('reach');
  });

  it('穷举任意两环节组合，结果恒 >= 原 maxReached', () => {
    for (const m of STAGES) {
      for (const t of STAGES) {
        expect(stageIndex(raiseMaxReached(m, t))).toBeGreaterThanOrEqual(
          stageIndex(m),
        );
      }
    }
  });

  it('nextStage 在末环节返回 null，其余返回下一环节', () => {
    expect(nextStage('brief')).toBe('match');
    expect(nextStage('delivery')).toBe('insight');
    expect(nextStage('insight')).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6）

   目的不是再测一遍守卫，而是测【上面那些断言本身有没有检测力】。
   做法：把不变量与单调性各造一个「反转」变异体，用同一组行为断言去跑，
   真实实现必须全过、变异体必须至少挂一条。若变异体也全过 = 断言是死的。
   ──────────────────────────────────────────────────────────────── */

/** 同一组行为断言，可作用在任意「不变量判定」实现上。抛错即视为翻红。 */
function invariantBehaviourSuite(
  held: (cur: Stage, maxReached: Stage) => boolean,
): void {
  // 合法态必须成立
  if (!held('brief', 'insight')) throw new Error('合法态 brief<=insight 被判不成立');
  if (!held('reach', 'reach')) throw new Error('合法态 reach<=reach 被判不成立');
  // 非法态必须不成立 —— 这是不变量的实质内容
  if (held('insight', 'brief')) throw new Error('非法态 insight>brief 被判成立');
  if (held('delivery', 'match')) throw new Error('非法态 delivery>match 被判成立');
}

/** 同一组行为断言，作用在任意「maxReached 抬升」实现上。 */
function monotonicBehaviourSuite(
  raise: (maxReached: Stage, target: Stage) => Stage,
): void {
  for (const m of STAGES) {
    for (const t of STAGES) {
      if (stageIndex(raise(m, t)) < stageIndex(m)) {
        throw new Error(`单调性被破坏：raise(${m}, ${t}) 回落`);
      }
    }
  }
}

describe('变异测试：证明上面的断言确有检测力（非死断言）', () => {
  it('真实的不变量实现通过整组行为断言', () => {
    expect(() => invariantBehaviourSuite(isStageInvariantHeld)).not.toThrow();
  });

  it('把不变量方向反转的变异体 → 同一组断言必须翻红', () => {
    // 变异：curIdx >= maxReachedIdx 视为合法（方向反了）
    const mutant = (cur: Stage, maxReached: Stage): boolean =>
      stageIndex(cur) >= stageIndex(maxReached);
    expect(() => invariantBehaviourSuite(mutant)).toThrow();
  });

  it('把不变量改成恒真的变异体 → 同一组断言必须翻红', () => {
    // 恒真是最危险的一种退化：守卫看似存在，实则从不拒绝任何东西
    const alwaysTrue = (): boolean => true;
    expect(() => invariantBehaviourSuite(alwaysTrue)).toThrow();
  });

  it('真实的抬升实现通过单调性行为断言', () => {
    expect(() => monotonicBehaviourSuite(raiseMaxReached)).not.toThrow();
  });

  it('把抬升改成「总是取目标值」的变异体 → 单调性断言必须翻红', () => {
    // 变异：直接赋值 target，丢掉「取较大者」——cur 回退时 maxReached 会跟着回落
    const mutant = (_maxReached: Stage, target: Stage): Stage => target;
    expect(() => monotonicBehaviourSuite(mutant)).toThrow();
  });

  it('把 D9 保守拒绝改成放行的变异体 → 会被 D9 那组断言抓住', () => {
    // 这条守的是本 feature 最要命的退化方向：
    // 依赖表还没建就放行 = 假守卫（PRD :129 反模式）。
    // 用行为等价的方式模拟「三条流转改成 allow」，再跑与 D9 用例同构的断言。
    const mutantAdvance = (c: EnvGuardContext): EnvGuardResult => {
      const next = nextStage(c.cur);
      if (next == null) return { allowed: false, reason: 'ALREADY_AT_FINAL_STAGE' };
      if (next === 'match') {
        return c.goal == null
          ? { allowed: false, reason: 'BRIEF_GOAL_NOT_CONFIRMED' }
          : { allowed: true, reason: null };
      }
      return { allowed: true, reason: null }; // ← 变异点：三条依赖未建的流转被放行
    };
    const d9From: Stage[] = ['match', 'reach', 'delivery'];
    const anyAllowed = d9From.some(
      (from) => mutantAdvance(ctx({ cur: from, maxReached: from })).allowed,
    );
    // 变异体确实放行了（说明这组输入能区分两种实现）
    expect(anyAllowed).toBe(true);
    // 真实实现在同样输入下一条都不放行
    const realAnyAllowed = d9From.some(
      (from) => canAdvance(ctx({ cur: from, maxReached: from })).allowed,
    );
    expect(realAnyAllowed).toBe(false);
  });
});
