// M3-B-DELIVERY F003 — domain/deal-advance.ts + domain/deliverable-plan.ts 单测 + D20 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6，crm-infer.test.ts / delivery-check.test.ts 先例）：
// 断言验【行为】不验源码关键字，且必须证明检测器活性——破坏流转约束的变异体在同一组
// 断言下必须翻红。若变异体也能全过，说明这组断言根本没在测不变量。

import { describe, it, expect } from 'vitest';
import {
  dealAdvance,
  nextDealStatus,
  hasReachedDealStage,
  DEAL_FLOW_ORDER,
  DEAL_RUNNING_STATUSES,
  DEAL_TERMINAL_STATUSES,
  type DealAdvanceResult,
  type DealStatus,
} from '../../src/lib/domain/deal-advance';
import {
  includesKeyDelivery,
  planDeliverables,
} from '../../src/lib/domain/deliverable-plan';

const ALL: readonly DealStatus[] = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
  'completed',
  'blocked',
  'defaulted',
];

/** 期望的合法边全集（与实现独立列出——实现改了这张表必须同步改，防止「改实现顺手改断言」）。 */
const LEGAL_EDGES: ReadonlyArray<[DealStatus, DealStatus]> = [
  // 主线
  ['negotiating', 'signed'],
  ['signed', 'escrowed'],
  ['escrowed', 'delivering'],
  ['delivering', 'completed'],
  // 运行态 → blocked
  ['negotiating', 'blocked'],
  ['signed', 'blocked'],
  ['escrowed', 'blocked'],
  ['delivering', 'blocked'],
  // 未完成 → defaulted
  ['negotiating', 'defaulted'],
  ['signed', 'defaulted'],
  ['escrowed', 'defaulted'],
  ['delivering', 'defaulted'],
  ['blocked', 'defaulted'],
  // blocked 恢复（回运行态）
  ['blocked', 'negotiating'],
  ['blocked', 'signed'],
  ['blocked', 'escrowed'],
  ['blocked', 'delivering'],
];

function isLegal(from: DealStatus, to: DealStatus): boolean {
  return LEGAL_EDGES.some(([f, t]) => f === from && t === to);
}

describe('dealAdvance：7×7 全矩阵', () => {
  for (const from of ALL) {
    for (const to of ALL) {
      const expected = isLegal(from, to);
      it(`${from} → ${to} = ${expected ? '合法' : '拒绝'}`, () => {
        const r = dealAdvance(from, to);
        expect(r.allowed).toBe(expected);
        expect(r.from).toBe(from);
        expect(r.to).toBe(to);
        if (expected) expect(r.reason).toBe('OK');
        else expect(r.reason).not.toBe('OK');
      });
    }
  }

  it('主线四步全部合法（negotiating→signed→escrowed→delivering→completed）', () => {
    for (let i = 0; i < DEAL_FLOW_ORDER.length - 1; i++) {
      const r = dealAdvance(DEAL_FLOW_ORDER[i], DEAL_FLOW_ORDER[i + 1]);
      expect(r.allowed).toBe(true);
    }
  });
});

describe('dealAdvance：拒绝原因码可分支', () => {
  it('跳态 → SKIPPED_STAGE', () => {
    expect(dealAdvance('negotiating', 'escrowed').reason).toBe('SKIPPED_STAGE');
    expect(dealAdvance('negotiating', 'completed').reason).toBe(
      'SKIPPED_STAGE',
    );
    expect(dealAdvance('signed', 'delivering').reason).toBe('SKIPPED_STAGE');
  });

  it('倒流 → BACKWARD', () => {
    expect(dealAdvance('escrowed', 'signed').reason).toBe('BACKWARD');
    expect(dealAdvance('delivering', 'negotiating').reason).toBe('BACKWARD');
  });

  it('自环 → SAME_STATE（no-op，不是推进）', () => {
    for (const s of ALL) {
      const r = dealAdvance(s, s);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('SAME_STATE');
    }
  });

  it('终态出边 → TERMINAL_STATE（completed / defaulted 均无出边）', () => {
    for (const from of DEAL_TERMINAL_STATUSES) {
      for (const to of ALL) {
        if (to === from) continue;
        const r = dealAdvance(from, to);
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('TERMINAL_STATE');
      }
    }
  });

  it('blocked → completed → ILLEGAL_TRANSITION（恢复后须重走 delivering）', () => {
    const r = dealAdvance('blocked', 'completed');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ILLEGAL_TRANSITION');
  });

  it('未知取值 → UNKNOWN_STATE（不把外部脏值当合法态放行）', () => {
    expect(dealAdvance('paid', 'completed').reason).toBe('UNKNOWN_STATE');
    expect(dealAdvance('signed', '').reason).toBe('UNKNOWN_STATE');
    expect(dealAdvance('signed', 'PAID').allowed).toBe(false);
  });

  it('纯函数：不抛错、同输入同输出、返回全新对象', () => {
    const a = dealAdvance('signed', 'escrowed');
    const b = dealAdvance('signed', 'escrowed');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('nextDealStatus / hasReachedDealStage', () => {
  it('主线后继逐个正确，终态与 blocked 无后继', () => {
    expect(nextDealStatus('negotiating')).toBe('signed');
    expect(nextDealStatus('signed')).toBe('escrowed');
    expect(nextDealStatus('escrowed')).toBe('delivering');
    expect(nextDealStatus('delivering')).toBe('completed');
    expect(nextDealStatus('completed')).toBeNull();
    expect(nextDealStatus('blocked')).toBeNull();
    expect(nextDealStatus('defaulted')).toBeNull();
  });

  it('hasReachedDealStage：已越过的阶段不再重复推进（登记幂等的判据）', () => {
    expect(hasReachedDealStage('escrowed', 'signed')).toBe(true);
    expect(hasReachedDealStage('escrowed', 'escrowed')).toBe(true);
    expect(hasReachedDealStage('signed', 'escrowed')).toBe(false);
    // 分支态不在主线上 → 恒 false（调用方必须显式处理）
    expect(hasReachedDealStage('blocked', 'signed')).toBe(false);
    expect(hasReachedDealStage('defaulted', 'signed')).toBe(false);
  });

  it('运行态 / 终态常量互斥且并集 = 七态', () => {
    expect(
      new Set([...DEAL_RUNNING_STATUSES, ...DEAL_TERMINAL_STATUSES, 'blocked']),
    ).toEqual(new Set(ALL));
  });
});

describe('planDeliverables（P3：五条件生成）', () => {
  it('恒五条且 kind 互不重复（@@unique[dealId,kind] 的应用层前提）', () => {
    const plan = planDeliverables(['1 条长视频']);
    expect(plan).toHaveLength(5);
    expect(new Set(plan.map((p) => p.kind)).size).toBe(5);
  });

  it('content/contract/escrow/ad_disclosure 恒必需且初态 pending', () => {
    const plan = planDeliverables(['1 条长视频']);
    for (const kind of ['content', 'contract', 'escrow', 'ad_disclosure']) {
      const row = plan.find((p) => p.kind === kind);
      expect(row?.required).toBe(true);
      expect(row?.status).toBe('pending');
    }
  });

  it('不含 key 交付 → key 行 required=false + na（不适用，不阻断 ready）', () => {
    const key = planDeliverables(['1 条长视频', '2 条 shorts']).find(
      (p) => p.kind === 'key',
    );
    expect(key).toEqual({ kind: 'key', required: false, status: 'na' });
  });

  it('含 key 交付 → key 行 required=true + pending', () => {
    for (const item of [
      '10 个 Steam key 分发',
      '附赠 CD-Key',
      '游戏激活码 ×5',
      '兑换码若干',
      '提供序列号',
      '发放 keys',
    ]) {
      const key = planDeliverables(['1 条长视频', item]).find(
        (p) => p.kind === 'key',
      );
      expect(key, `「${item}」应识别为 key 交付`).toEqual({
        kind: 'key',
        required: true,
        status: 'pending',
      });
    }
  });

  it('词边界：monkey / keyboard 不得误判为 key 交付（保守优先）', () => {
    expect(includesKeyDelivery(['monkey 实况一期'])).toBe(false);
    expect(includesKeyDelivery(['keyboard 开箱'])).toBe(false);
    expect(includesKeyDelivery(['Turkey 地区直播'])).toBe(false);
    expect(includesKeyDelivery([])).toBe(false);
    expect(includesKeyDelivery(null)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6，acceptance 4）

   目的不是再测一遍流转，而是测【上面那些断言本身有没有检测力】。
   资金状态机被放宽的方向（允许跳态 / 终态复活 / 倒流）就是审计链失真的方向。
   ──────────────────────────────────────────────────────────────── */

type AdvanceFn = (from: string, to: string) => DealAdvanceResult;

/** 同一组行为断言，可作用在任意「Deal 状态机」实现上。抛错即视为翻红。 */
function dealBehaviourSuite(advance: AdvanceFn): void {
  // 1) 主线相邻合法
  if (!advance('negotiating', 'signed').allowed) {
    throw new Error('主线 negotiating → signed 被拒');
  }
  if (!advance('delivering', 'completed').allowed) {
    throw new Error('主线 delivering → completed 被拒');
  }
  // 2) 不得跳态（放款前提未被逐级核实）
  if (advance('negotiating', 'delivering').allowed) {
    throw new Error('跳态 negotiating → delivering 被放行');
  }
  if (advance('signed', 'completed').allowed) {
    throw new Error('跳态 signed → completed 被放行');
  }
  // 3) 不得倒流（审计链单向）
  if (advance('escrowed', 'signed').allowed) {
    throw new Error('倒流 escrowed → signed 被放行');
  }
  // 4) 终态无出边
  if (advance('completed', 'delivering').allowed) {
    throw new Error('completed 复活');
  }
  if (advance('defaulted', 'negotiating').allowed) {
    throw new Error('defaulted 复活');
  }
  // 5) blocked 可恢复到运行态，但不得直达 completed
  if (!advance('blocked', 'delivering').allowed) {
    throw new Error('blocked 无法恢复到运行态');
  }
  if (advance('blocked', 'completed').allowed) {
    throw new Error('blocked 直接跳到 completed');
  }
  // 6) 自环不算推进
  if (advance('signed', 'signed').allowed) {
    throw new Error('自环被当成合法推进');
  }
  // 7) 未知态不放行
  if (advance('signed', 'paid').allowed) {
    throw new Error('未知目标态被放行');
  }
}

describe('D20 变异测试：破坏流转约束 → 同一组断言必须翻红', () => {
  it('真实实现通过整组行为断言', () => {
    expect(() => dealBehaviourSuite(dealAdvance)).not.toThrow();
  });

  it('变异体 A：允许跳态（只要向前就放行）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => {
      const real = dealAdvance(from, to);
      return real.reason === 'SKIPPED_STAGE'
        ? { ...real, allowed: true, reason: 'OK' }
        : real;
    };
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 B：终态可复活（completed/defaulted 出边放行）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => {
      const real = dealAdvance(from, to);
      return real.reason === 'TERMINAL_STATE'
        ? { ...real, allowed: true, reason: 'OK' }
        : real;
    };
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 C：允许倒流（状态可回退）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => {
      const real = dealAdvance(from, to);
      return real.reason === 'BACKWARD'
        ? { ...real, allowed: true, reason: 'OK' }
        : real;
    };
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 D：blocked 可直达 completed（争议一步收尾）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => {
      const real = dealAdvance(from, to);
      return from === 'blocked' && to === 'completed'
        ? { ...real, allowed: true, reason: 'OK' }
        : real;
    };
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 E：恒放行（状态机作废）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => ({
      allowed: true,
      from: from as DealStatus,
      to: to as DealStatus,
      reason: 'OK',
    });
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 F：未知态按合法处理（脏值放行）→ 翻红', () => {
    const mutant: AdvanceFn = (from, to) => {
      const real = dealAdvance(from, to);
      return real.reason === 'UNKNOWN_STATE'
        ? { ...real, allowed: true, reason: 'OK' }
        : real;
    };
    expect(() => dealBehaviourSuite(mutant)).toThrow();
  });
});
