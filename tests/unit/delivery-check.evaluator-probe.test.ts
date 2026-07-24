// M3-B-DELIVERY F002 验收探针（Evaluator 独立编写，非实现方测试）。
//
// 目的：探 `tests/unit/delivery-check.test.ts` 未覆盖的契约边角，验证
// `checkDeliveryRow` 在**脏输入**下仍然确定、仍然 fail-safe 向拒付。
// 资金闸门的判据函数，边角行为不能靠「DB 有 @@unique 所以不会发生」兜底——
// payout 服务端二次校验直接消费本函数结论，输入形状一旦漂移就是放款事故。
//
// 覆盖：重复 kind / 未知 kind / 冻结入参 / 缺口顺序 / 复合缺口 / required=false 的 missing。

import { describe, it, expect } from 'vitest';
import {
  checkDeliveryRow,
  DELIVERABLE_KINDS,
  type DeliverableKind,
  type DeliveryCheckInput,
} from '../../src/lib/domain/delivery-check';

function rowsAllMet(): DeliveryCheckInput['deliverables'] {
  return DELIVERABLE_KINDS.map((kind) => ({
    kind,
    status: 'met' as const,
    required: true,
    evidenceRef: null as string | null,
    note: null as string | null,
  }));
}

function withDeliverables(
  deliverables: DeliveryCheckInput['deliverables'],
  dealStatus: DeliveryCheckInput['deal']['status'] = 'delivering',
): DeliveryCheckInput {
  return { deal: { id: 'probe-deal', status: dealStatus }, deliverables };
}

describe('[探针] 脏输入下的确定性', () => {
  it('同 kind 重复行：取输入序首条，结论不随重复行摇摆', () => {
    const dupMetFirst = [
      { kind: 'contract' as const, status: 'met' as const, required: true },
      { kind: 'contract' as const, status: 'missing' as const, required: true },
      ...rowsAllMet().filter((r) => r.kind !== 'contract'),
    ];
    const dupMissingFirst = [
      { kind: 'contract' as const, status: 'missing' as const, required: true },
      { kind: 'contract' as const, status: 'met' as const, required: true },
      ...rowsAllMet().filter((r) => r.kind !== 'contract'),
    ];

    const a = checkDeliveryRow(withDeliverables(dupMetFirst));
    const b = checkDeliveryRow(withDeliverables(dupMissingFirst));

    expect(a.conditions).toHaveLength(5);
    expect(b.conditions).toHaveLength(5);
    // 首条决定：met 首 → 可放款；missing 首 → 阻断（且缺口只记一条，不因重复行重复列）
    expect(a.ready).toBe(true);
    expect(b.ready).toBe(false);
    expect(b.gaps).toEqual([
      { kind: 'contract', reason: 'MISSING', note: null },
    ]);
  });

  it('未知 kind 混入：被忽略，conditions 恒五条且不污染 ready', () => {
    const withJunk = [
      ...rowsAllMet(),
      { kind: 'not_a_real_kind' as unknown as DeliverableKind, status: 'missing' as const, required: true },
    ];
    const r = checkDeliveryRow(withDeliverables(withJunk));
    expect(r.conditions.map((c) => c.kind)).toEqual([...DELIVERABLE_KINDS]);
    expect(r.ready).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it('入参深度冻结：不抛错（证明确实不写入参，而非「碰巧没人观察到写」）', () => {
    const deliverables = rowsAllMet().map((r) => Object.freeze({ ...r }));
    const input = Object.freeze({
      deal: Object.freeze({ id: 'probe-deal', status: 'delivering' as const }),
      deliverables: Object.freeze(deliverables),
    }) as DeliveryCheckInput;
    expect(() => checkDeliveryRow(input)).not.toThrow();
    expect(checkDeliveryRow(input).ready).toBe(true);
  });
});

describe('[探针] 缺口清单的可消费性', () => {
  it('缺口顺序 = 台账列序，Deal 级缺口排在条件级之后（渲染顺序稳定）', () => {
    const partial = rowsAllMet()
      .filter((r) => r.kind !== 'content')
      .map((r) => (r.kind === 'escrow' ? { ...r, status: 'missing' as const } : r));
    const r = checkDeliveryRow(withDeliverables(partial, 'blocked'));

    expect(r.gaps.map((g) => [g.kind, g.reason])).toEqual([
      ['content', 'ROW_ABSENT'],
      ['escrow', 'MISSING'],
      [null, 'DEAL_BLOCKED'],
    ]);
  });

  it('复合缺口：条件缺 + Deal blocked 同时列出（不互相吞掉）', () => {
    const r = checkDeliveryRow(
      withDeliverables(
        rowsAllMet().map((x) =>
          x.kind === 'key' ? { ...x, status: 'pending' as const } : x,
        ),
        'blocked',
      ),
    );
    expect(r.ready).toBe(false);
    expect(r.gaps.some((g) => g.reason === 'PENDING' && g.kind === 'key')).toBe(true);
    expect(r.gaps.some((g) => g.reason === 'DEAL_BLOCKED' && g.kind === null)).toBe(true);
  });
});

describe('[探针] required=false 的 missing —— 记录 spec §3 P5 口径', () => {
  it('非必需条件即使 missing 也不阻断 ready，但单元仍显 miss（三态诚实，不静默改写成 na）', () => {
    const r = checkDeliveryRow(
      withDeliverables(
        rowsAllMet().map((x) =>
          x.kind === 'key' ? { ...x, status: 'missing' as const, required: false } : x,
        ),
      ),
    );
    // ready 只看必需条件（P5 原文），故不阻断
    expect(r.ready).toBe(true);
    expect(r.gaps).toEqual([]);
    // 但展示层保留 miss，不被压成 na —— 台账仍如实显示「缺」
    expect(r.byKind.key.cell).toBe('miss');
    expect(r.byKind.key.required).toBe(false);
  });
});
