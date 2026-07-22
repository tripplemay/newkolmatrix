// M2-A-MATCH F005 — match 展示层格式化单点单测。
//
// 验收锚点：reachTotal→万级串 / budgetUsd null→「待核」（P6）/ risk→低中高 /
// 【P5】bars = 组内 top6 matchScore 归一 0-9 / 「待核」口径（裁决 #2）。

import { describe, expect, it } from 'vitest';
import {
  deriveBars,
  formatBudgetUsd,
  formatPlat,
  formatRisk,
  formatWan,
  matchPlanViewListSchema,
  toCandidateView,
  toPlanView,
} from 'lib/display/match-format';
import { PENDING_TEXT } from 'lib/data/provenance';
import type { PlanMetrics } from 'lib/data/schemas/match';

describe('formatWan（万级串）', () => {
  it('2_400_000 → 240万；420_000 → 42万', () => {
    expect(formatWan(2_400_000)).toBe('240万');
    expect(formatWan(420_000)).toBe('42万');
  });

  it('<1 万显原值；null → 「待核」', () => {
    expect(formatWan(5000)).toBe('5000');
    expect(formatWan(null)).toBe(PENDING_TEXT.verify);
  });
});

describe('formatBudgetUsd（P6 恒 null → 待核）', () => {
  it('null → 「待核」（不编造成本数）', () => {
    expect(formatBudgetUsd(null)).toBe(PENDING_TEXT.verify);
  });

  it('有值 →  美元串（未来价格数据接入后口径已备）', () => {
    expect(formatBudgetUsd(11_000)).toBe('$11,000');
  });
});

describe('formatRisk', () => {
  it('low/mid/high → 低/中/高；null → 待核', () => {
    expect(formatRisk('low')).toBe('低');
    expect(formatRisk('mid')).toBe('中');
    expect(formatRisk('high')).toBe('高');
    expect(formatRisk(null)).toBe(PENDING_TEXT.verify);
  });
});

describe('formatPlat（「YouTube · 42万」语义）', () => {
  it('平台标签 + 粉丝万级', () => {
    expect(formatPlat('youtube', 420_000)).toBe('YouTube · 42万');
    expect(formatPlat('tiktok', 670_000)).toBe('TikTok · 67万');
  });

  it('未知平台显原串；null 平台显 —；followers null → 待核', () => {
    expect(formatPlat('bilibili', 510_000)).toBe('bilibili · 51万');
    expect(formatPlat(null, null)).toBe(`— · ${PENDING_TEXT.verify}`);
  });
});

describe('deriveBars（P5：top6 matchScore 归一 0-9）', () => {
  it('score 0-1 → 0-9 档位取整', () => {
    expect(deriveBars([1, 0.74, 0.6])).toEqual([9, 7, 5, 0, 0, 0]);
  });

  it('恒 6 根（多裁少补 0）+ 越界钳制', () => {
    expect(deriveBars([1, 1, 1, 1, 1, 1, 1, 1])).toEqual([9, 9, 9, 9, 9, 9]);
    expect(deriveBars([])).toEqual([0, 0, 0, 0, 0, 0]);
    expect(deriveBars([1.5, -0.2])).toEqual([9, 0, 0, 0, 0, 0]);
  });
});

describe('toPlanView（DB 行 → 视图）', () => {
  const METRICS: PlanMetrics = {
    reachTotal: 2_680_000,
    budgetUsd: null,
    risk: 'low',
    people: 13,
  };
  const ROW = {
    id: 'p1',
    name: 'B · 均衡组',
    recommended: true,
    rationale: '分层混合',
    metrics: METRICS,
    topScores: [0.9, 0.8],
  };

  it('合法 metrics → 展示串逐字段格式化', () => {
    const v = toPlanView(ROW);
    expect(v).toEqual({
      id: 'p1',
      name: 'B · 均衡组',
      best: true,
      reach: '268万',
      cost: PENDING_TEXT.verify, // P6
      risk: '低',
      people: '13 人',
      bars: [8, 7, 0, 0, 0, 0],
      basis: '分层混合',
    });
  });

  it('脏 metrics → 各指标降级「待核」不抛错（D2）', () => {
    const v = toPlanView({ ...ROW, metrics: 'broken' });
    expect(v.reach).toBe(PENDING_TEXT.verify);
    expect(v.risk).toBe(PENDING_TEXT.verify);
    expect(v.people).toBe(PENDING_TEXT.verify);
  });

  it('视图过 zod 列表契约（3 组锁）', () => {
    const three = [
      toPlanView(ROW),
      toPlanView({ ...ROW, id: 'p2' }),
      toPlanView({ ...ROW, id: 'p3' }),
    ];
    expect(matchPlanViewListSchema.safeParse(three).success).toBe(true);
    expect(matchPlanViewListSchema.safeParse([]).success).toBe(false); // 0 组 → 空态占位路径
  });
});

describe('toCandidateView（裁决 #2「待核」口径）', () => {
  const ROW = {
    displayName: 'ChefRen',
    platform: 'tiktok',
    followers: 670_000,
    matchScore: 0.68,
    scorePending: false,
    doubts: ['历史合作有 1 次延迟交付记录'],
    preJudge: '中',
  };

  it('有分且不降级 → 显百分比；scorePending → null（显示层「待核」）', () => {
    expect(toCandidateView(ROW).match).toBe('68%');
    expect(toCandidateView({ ...ROW, scorePending: true }).match).toBeNull();
    expect(toCandidateView({ ...ROW, matchScore: null }).match).toBeNull();
  });

  it('doubts 拼接为存疑原因；preJudge 非法值兜底 ?', () => {
    const v = toCandidateView({ ...ROW, doubts: ['a', 'b'], preJudge: '爆表' });
    expect(v.why).toBe('a；b');
    expect(v.fit).toBe('?');
  });

  it('displayName null → 「待补充」占位（不显空串）', () => {
    expect(toCandidateView({ ...ROW, displayName: null }).name).toBe(
      PENDING_TEXT.fill,
    );
  });
});
