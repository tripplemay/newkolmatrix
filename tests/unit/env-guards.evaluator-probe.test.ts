// Evaluator 独立探针（M1-A-BRIEF F005 验收，非 Generator 产物）。
//
// 目的：用 Generator 测试套件之外的输入空间，独立复核 F005 acceptance 的四条硬判据：
//   (1) D9 三条依赖未建的流转，在【任意合法上下文】下都不得放行（不只是 cur=maxReached 那一列）
//   (2) D2 双值不变量在 cur 回退态（cur < maxReached）下的行为——这是 D2 引入双值的唯一理由，
//       Generator 套件几乎只喂 cur === maxReached，该列输入基本未被覆盖
//   (3) 返回结构恒为 {allowed, reason} 且 reason 只取 EnvGuardReason 字面量集合（D8）
//   (4) 全输入空间穷举下不出现 undefined / 抛错 / 自由文本理由
//
// 断言一律验行为，不读源码关键字（D20）。

import { describe, it, expect } from 'vitest';
import {
  canEnter,
  canAdvance,
  isStageInvariantHeld,
  raiseMaxReached,
  nextStage,
  stageIndex,
  type EnvGuardContext,
  type EnvGuardReason,
} from '../../src/lib/domain/env-guards';
import { STAGES, type Stage } from '../../src/lib/agent/stage-routing';
import type { ProjectGoal } from '../../src/lib/data/schemas/project';

const GOAL: ProjectGoal = {
  targetExposure: 3_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

/** D8 允许的理由全集。出现集合外取值 = 自由文本泄漏。 */
// M2-A F004 机械同步：EnvGuardReason 扩 MATCH_PLAN_NOT_APPROVED（→reach 真判定）。
const REASONS: ReadonlySet<string> = new Set<EnvGuardReason>([
  'STAGE_NOT_UNLOCKED',
  'BRIEF_GOAL_NOT_CONFIRMED',
  'MATCH_PLAN_NOT_APPROVED',
  'DEPENDENCY_NOT_IMPLEMENTED',
  'ALREADY_AT_FINAL_STAGE',
  'INVARIANT_VIOLATED',
]);

/** 所有满足不变量的 (cur, maxReached) 组合 —— 含 cur < maxReached 的回退态。 */
const VALID_STATES: Array<{ cur: Stage; maxReached: Stage }> = STAGES.flatMap(
  (cur, ci) =>
    STAGES.filter((_, mi) => mi >= ci).map((maxReached) => ({
      cur,
      maxReached,
    })),
);

const ctx = (o: Partial<EnvGuardContext> = {}): EnvGuardContext => ({
  cur: 'brief',
  maxReached: 'brief',
  goal: GOAL,
  // M2-A F004 机械同步：EnvGuardContext 扩必填 hasApprovedMatchPlan，默认 false
  //（无已批准组合）。原「D9 三条」中 match→reach 已被真判定替换，探针前提同步翻牌：
  // match 的拒绝理由从 DEPENDENCY_NOT_IMPLEMENTED 变为 MATCH_PLAN_NOT_APPROVED。
  hasApprovedMatchPlan: false,
  ...o,
});

describe('[Evaluator] 未满足前置的流转在全合法状态空间不放行（不只 cur===maxReached 那一列）', () => {
  it('cur ∈ {match, reach, delivery} 且无已批准组合时，无论 maxReached 已解锁到多远、goal 是否齐备，一律不放行', () => {
    const guardedCur: Stage[] = ['match', 'reach', 'delivery'];
    for (const { cur, maxReached } of VALID_STATES) {
      if (!guardedCur.includes(cur)) continue;
      for (const goal of [GOAL, null]) {
        const r = canAdvance(ctx({ cur, maxReached, goal }));
        expect(
          r.allowed,
          `cur=${cur} maxReached=${maxReached} goal=${goal ? 'set' : 'null'}`,
        ).toBe(false);
        // match→reach = 真判定理由（F004）；reach/delivery = D9 占位理由（M3）
        expect(r.reason).toBe(
          cur === 'match'
            ? 'MATCH_PLAN_NOT_APPROVED'
            : 'DEPENDENCY_NOT_IMPLEMENTED',
        );
      }
    }
  });

  it('即便 maxReached 已到末环节（历史上曾解锁过），仍不放行 —— 解锁历史不得成为绕过依赖检查的后门', () => {
    for (const cur of ['match', 'reach', 'delivery'] as Stage[]) {
      const r = canAdvance(ctx({ cur, maxReached: 'insight' }));
      expect(r.allowed, `cur=${cur} maxReached=insight`).toBe(false);
      expect(r.reason).toBe(
        cur === 'match'
          ? 'MATCH_PLAN_NOT_APPROVED'
          : 'DEPENDENCY_NOT_IMPLEMENTED',
      );
    }
  });

  it('[F004 扩] match→reach 仅在 hasApprovedMatchPlan=true 时放行；该判据不旁路 M3 两条', () => {
    expect(
      canAdvance(
        ctx({ cur: 'match', maxReached: 'match', hasApprovedMatchPlan: true }),
      ),
    ).toEqual({ allowed: true, reason: null });
    for (const cur of ['reach', 'delivery'] as Stage[]) {
      const r = canAdvance(
        ctx({ cur, maxReached: cur, hasApprovedMatchPlan: true }),
      );
      expect(r.allowed, `cur=${cur} 不得被 approved 旁路`).toBe(false);
    }
  });
});

describe('[Evaluator] D2 回退态（cur < maxReached）—— 双值设计的唯一理由，须行为明确', () => {
  it('回退到 brief 后，goal 齐备则可重新推进；goal 被清空则拒绝（判据仍生效，不因曾解锁而豁免）', () => {
    expect(
      canAdvance(ctx({ cur: 'brief', maxReached: 'insight', goal: GOAL }))
        .allowed,
    ).toBe(true);
    expect(
      canAdvance(ctx({ cur: 'brief', maxReached: 'insight', goal: null })),
    ).toEqual({
      allowed: false,
      reason: 'BRIEF_GOAL_NOT_CONFIRMED',
    });
  });

  it('回退态下 canEnter 的解锁范围仍以 maxReached 为准，不随 cur 收缩', () => {
    const back = ctx({ cur: 'brief', maxReached: 'delivery' });
    STAGES.forEach((target, t) => {
      expect(canEnter(back, target).allowed, `target=${target}`).toBe(
        t <= stageIndex('delivery'),
      );
    });
  });

  it('推进后抬升不回落：raiseMaxReached 在回退态下保住历史最远位', () => {
    // cur=brief 回退态推进到 match，maxReached 原为 delivery → 必须仍是 delivery
    expect(raiseMaxReached('delivery', 'match')).toBe('delivery');
  });
});

describe('[Evaluator] D8 返回结构在全输入空间恒定（无 undefined / 无自由文本 / 不抛错）', () => {
  const WEIRD = [
    '',
    'nope',
    'BRIEF',
    'brief ',
    '0',
    '__proto__',
  ] as unknown as Stage[];
  const ALL = [...STAGES, ...WEIRD];

  it('canEnter：任意 (cur, maxReached, target) 组合都返回合法结构', () => {
    for (const cur of ALL) {
      for (const maxReached of ALL) {
        for (const target of ALL) {
          const r = canEnter(ctx({ cur, maxReached }), target);
          expect(typeof r?.allowed, `${cur}/${maxReached}/${target}`).toBe(
            'boolean',
          );
          if (r.allowed) expect(r.reason).toBeNull();
          else
            expect(
              REASONS.has(r.reason as string),
              `理由越界: ${r.reason}`,
            ).toBe(true);
        }
      }
    }
  });

  it('canAdvance：任意 (cur, maxReached, goal) 组合都返回合法结构', () => {
    for (const cur of ALL) {
      for (const maxReached of ALL) {
        for (const goal of [GOAL, null]) {
          const r = canAdvance(ctx({ cur, maxReached, goal }));
          expect(typeof r?.allowed, `${cur}/${maxReached}`).toBe('boolean');
          if (r.allowed) expect(r.reason).toBeNull();
          else
            expect(
              REASONS.has(r.reason as string),
              `理由越界: ${r.reason}`,
            ).toBe(true);
        }
      }
    }
  });

  it('非法环节取值一律被不变量拦下，绝不放行', () => {
    for (const bad of WEIRD) {
      expect(isStageInvariantHeld(bad, 'insight')).toBe(false);
      expect(
        canEnter(ctx({ cur: bad, maxReached: 'insight' }), 'brief').allowed,
      ).toBe(false);
      expect(canAdvance(ctx({ cur: bad, maxReached: 'insight' })).allowed).toBe(
        false,
      );
    }
  });

  it('nextStage 对非法取值返回 null，不抛错、不返回 undefined', () => {
    for (const bad of WEIRD) expect(nextStage(bad)).toBeNull();
  });
});

describe('[Evaluator] 单调性：抬升在全组合下恒不回落（含非法取值）', () => {
  it('合法组合：raise 结果序号 >= 原 maxReached 序号', () => {
    for (const m of STAGES) {
      for (const t of STAGES) {
        expect(stageIndex(raiseMaxReached(m, t))).toBeGreaterThanOrEqual(
          stageIndex(m),
        );
      }
    }
  });

  it('目标为非法取值时不得把 maxReached 污染成非法值', () => {
    for (const bad of ['nope', ''] as unknown as Stage[]) {
      // 非法目标 stageIndex = -1，不大于任何合法序号 → 必须保持原值
      expect(raiseMaxReached('reach', bad)).toBe('reach');
      expect(raiseMaxReached('brief', bad)).toBe('brief');
    }
  });
});
