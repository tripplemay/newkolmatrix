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
  // hasApprovedMatchPlan 默认 false（M2-A F004 扩列）：既有用例语义不变——
  // 无已批准组合时 →reach 拒绝（理由从 D9 占位翻为真判定理由）。
  // M3-B F010 机械同步：扩必填 hasDeal / allDealsSettled，默认 false（无 Deal、未收尾）——
  // 既有「未满足前置一律拒」的用例语义同样不变，只是拒绝理由从 D9 占位翻为真判定理由。
  return {
    cur: 'brief',
    maxReached: 'brief',
    goal: GOAL,
    hasApprovedMatchPlan: false,
    hasDeal: false,
    allDealsSettled: false,
    ...over,
  };
}

describe('canEnter：可回看已解锁，不可跳未解锁（FR-7.9）', () => {
  it('目标 = maxReached → 放行', () => {
    expect(
      canEnter(ctx({ cur: 'reach', maxReached: 'reach' }), 'reach'),
    ).toEqual({
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
    const r = canAdvance(
      ctx({ cur: 'brief', maxReached: 'brief', goal: GOAL }),
    );
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it('brief→match：goal 未确认 → 拒绝，理由 BRIEF_GOAL_NOT_CONFIRMED', () => {
    const r = canAdvance(
      ctx({ cur: 'brief', maxReached: 'brief', goal: null }),
    );
    expect(r).toEqual({ allowed: false, reason: 'BRIEF_GOAL_NOT_CONFIRMED' });
  });

  it('末环节 insight 无可推进 → ALREADY_AT_FINAL_STAGE', () => {
    const r = canAdvance(ctx({ cur: 'insight', maxReached: 'insight' }));
    expect(r).toEqual({ allowed: false, reason: 'ALREADY_AT_FINAL_STAGE' });
  });
});

describe('→delivery / →insight 真判定（M3-B F010：D9 占位理由退役）', () => {
  it('reach→delivery：无 Deal → 拒绝，理由 NO_DEAL_YET', () => {
    const r = canAdvance(ctx({ cur: 'reach', maxReached: 'reach' }));
    expect(r).toEqual({ allowed: false, reason: 'NO_DEAL_YET' });
  });

  it('reach→delivery：存在 Deal → 放行', () => {
    const r = canAdvance(
      ctx({ cur: 'reach', maxReached: 'reach', hasDeal: true }),
    );
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it('delivery→insight：仍有 Deal 未收尾 → 拒绝，理由 DEALS_NOT_SETTLED', () => {
    const r = canAdvance(
      ctx({ cur: 'delivery', maxReached: 'delivery', hasDeal: true }),
    );
    expect(r).toEqual({ allowed: false, reason: 'DEALS_NOT_SETTLED' });
  });

  it('delivery→insight：全部 Deal 收尾 → 放行', () => {
    const r = canAdvance(
      ctx({
        cur: 'delivery',
        maxReached: 'delivery',
        hasDeal: true,
        allDealsSettled: true,
      }),
    );
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it('P12 空态诚实：零 Deal 项目不被 →insight 阻断（allDealsSettled=true 即放行）', () => {
    const r = canAdvance(
      ctx({
        cur: 'delivery',
        maxReached: 'delivery',
        hasDeal: false,
        allDealsSettled: true,
      }),
    );
    expect(r.allowed).toBe(true);
  });

  it('两条判据互不旁路：hasDeal 只解锁 →delivery，不解锁 →insight', () => {
    const toInsight = canAdvance(
      ctx({ cur: 'delivery', maxReached: 'delivery', hasDeal: true }),
    );
    expect(toInsight.allowed).toBe(false);
    const toDelivery = canAdvance(
      ctx({ cur: 'reach', maxReached: 'reach', hasDeal: true }),
    );
    expect(toDelivery.allowed).toBe(true);
  });

  it('五条流转全部真判：不存在任何返回 D9 占位理由的分支（行为面证据）', () => {
    const reasons = new Set<string>();
    for (const cur of STAGES) {
      for (const goal of [GOAL, null]) {
        for (const hasApprovedMatchPlan of [true, false]) {
          for (const hasDeal of [true, false]) {
            for (const allDealsSettled of [true, false]) {
              const r = canAdvance(
                ctx({
                  cur,
                  maxReached: cur,
                  goal,
                  hasApprovedMatchPlan,
                  hasDeal,
                  allDealsSettled,
                }),
              );
              if (r.reason) reasons.add(r.reason);
            }
          }
        }
      }
    }
    expect(reasons.has('DEPENDENCY_NOT_IMPLEMENTED')).toBe(false);
    expect(reasons).toContain('NO_DEAL_YET');
    expect(reasons).toContain('DEALS_NOT_SETTLED');
  });

  it('全环节穷举（判据全 false）：canAdvance 只在 brief→match 且 goal 齐备时放行', () => {
    for (const from of STAGES) {
      const r = canAdvance(ctx({ cur: from, maxReached: from, goal: GOAL }));
      expect(r.allowed, `cur=${from}`).toBe(from === 'brief');
    }
  });
});

describe('→reach 真判定（M2-A F004：MATCH_PLAN_NOT_APPROVED 替换 D9 保守拒）', () => {
  it('match→reach：无已批准组合 → 拒绝，理由 MATCH_PLAN_NOT_APPROVED', () => {
    const r = canAdvance(
      ctx({ cur: 'match', maxReached: 'match', hasApprovedMatchPlan: false }),
    );
    expect(r).toEqual({ allowed: false, reason: 'MATCH_PLAN_NOT_APPROVED' });
  });

  it('match→reach：存在已批准组合 → 放行', () => {
    const r = canAdvance(
      ctx({ cur: 'match', maxReached: 'match', hasApprovedMatchPlan: true }),
    );
    expect(r).toEqual({ allowed: true, reason: null });
  });

  it('真判定理由与 D9 占位理由可区分（grep 零残留的行为面证据）', () => {
    const real = canAdvance(ctx({ cur: 'match', maxReached: 'match' }));
    expect(real.reason).toBe('MATCH_PLAN_NOT_APPROVED');
  });

  it('hasApprovedMatchPlan 只解锁 →reach，不旁路其他守卫（M3-B 两条各有判据）', () => {
    const denials: Record<string, string> = {
      reach: 'NO_DEAL_YET',
      delivery: 'DEALS_NOT_SETTLED',
    };
    for (const cur of ['reach', 'delivery'] as Stage[]) {
      const r = canAdvance(
        ctx({ cur, maxReached: cur, hasApprovedMatchPlan: true }),
      );
      expect(r.allowed, `cur=${cur}`).toBe(false);
      expect(r.reason).toBe(denials[cur]);
    }
    // goal 判据同样不受影响
    const brief = canAdvance(
      ctx({
        cur: 'brief',
        maxReached: 'brief',
        goal: null,
        hasApprovedMatchPlan: true,
      }),
    );
    expect(brief.reason).toBe('BRIEF_GOAL_NOT_CONFIRMED');
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
  if (!held('brief', 'insight'))
    throw new Error('合法态 brief<=insight 被判不成立');
  if (!held('reach', 'reach'))
    throw new Error('合法态 reach<=reach 被判不成立');
  // 非法态必须不成立 —— 这是不变量的实质内容
  if (held('insight', 'brief'))
    throw new Error('非法态 insight>brief 被判成立');
  if (held('delivery', 'match'))
    throw new Error('非法态 delivery>match 被判成立');
}

/**
 * 同一组行为断言，作用在任意「canAdvance」实现上，专盯 M3-B F010 两条判据。
 * 抛错即视为翻红。
 */
function dealGuardBehaviourSuite(
  advance: (c: EnvGuardContext) => EnvGuardResult,
): void {
  // 1) 无 Deal 不得进交付
  if (advance(ctx({ cur: 'reach', maxReached: 'reach' })).allowed) {
    throw new Error('无 Deal 仍放行 →delivery');
  }
  // 2) 有 Deal 必须能进交付（判据是真能力，不是摆设）
  if (
    !advance(ctx({ cur: 'reach', maxReached: 'reach', hasDeal: true })).allowed
  ) {
    throw new Error('有 Deal 却拒绝 →delivery');
  }
  // 3) 交易未收尾不得进洞察
  if (
    advance(ctx({ cur: 'delivery', maxReached: 'delivery', hasDeal: true }))
      .allowed
  ) {
    throw new Error('仍有未收尾交易却放行 →insight');
  }
  // 4) 全部收尾必须能进洞察
  if (
    !advance(
      ctx({
        cur: 'delivery',
        maxReached: 'delivery',
        hasDeal: true,
        allDealsSettled: true,
      }),
    ).allowed
  ) {
    throw new Error('全部交易收尾却拒绝 →insight');
  }
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

  it('把 →delivery/→insight 判据取反的变异体 → 同一组断言必须翻红（M3-B F010）', () => {
    // 变异：hasDeal / allDealsSettled 取反送进真实守卫——判据方向反了，
    // 「没有 Deal 反而能进交付、交易没收尾反而能进洞察」。
    const mutant = (c: EnvGuardContext): EnvGuardResult =>
      canAdvance({
        ...c,
        hasDeal: !c.hasDeal,
        allDealsSettled: !c.allDealsSettled,
      });
    expect(() => dealGuardBehaviourSuite(mutant)).toThrow();
    // 真实实现在同一组断言下全过
    expect(() => dealGuardBehaviourSuite(canAdvance)).not.toThrow();
  });

  it('把 →delivery/→insight 改成恒放行的变异体 → 同一组断言必须翻红', () => {
    // 恒放行 = 假守卫（PRD :129 反模式）：交付/洞察门形同虚设。
    const mutant = (c: EnvGuardContext): EnvGuardResult => {
      const real = canAdvance(c);
      return real.reason === 'NO_DEAL_YET' ||
        real.reason === 'DEALS_NOT_SETTLED'
        ? { allowed: true, reason: null }
        : real;
    };
    expect(() => dealGuardBehaviourSuite(mutant)).toThrow();
  });

  it('把 D9 保守拒绝改成放行的变异体 → 会被 D9 那组断言抓住', () => {
    // 这条守的是本 feature 最要命的退化方向：
    // 依赖表还没建就放行 = 假守卫（PRD :129 反模式）。
    // 用行为等价的方式模拟「三条流转改成 allow」，再跑与 D9 用例同构的断言。
    const mutantAdvance = (c: EnvGuardContext): EnvGuardResult => {
      const next = nextStage(c.cur);
      if (next == null)
        return { allowed: false, reason: 'ALREADY_AT_FINAL_STAGE' };
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
