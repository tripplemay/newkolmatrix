// M3-B-DELIVERY F002 — domain/delivery-check.ts 单测 + D20 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6，crm-infer.test.ts / env-guards.test.ts 先例）：
// 断言验【行为】不验源码关键字，且必须证明检测器活性——破坏判定规则的变异体在同一组
// 断言下必须翻红。若变异体也能全过，说明这组断言根本没在测不变量。
//
// 本函数是资金闸门的判据（payout 服务端二次校验复用同一函数，P6），
// 所以「ready 被错误放宽」是最要命的退化方向——变异体 A/B/C 专盯这一类。

import { describe, it, expect } from 'vitest';
import {
  checkDeliveryRow,
  conditionCellOf,
  DELIVERABLE_KINDS,
  type DealStatus,
  type DeliverableKind,
  type DeliverableStatus,
  type DeliveryCheckInput,
  type DeliveryCheckResult,
  type DeliveryCondition,
} from '../../src/lib/domain/delivery-check';

// ───────────────────────── fixtures ─────────────────────────

const ALL_STATUSES: readonly DeliverableStatus[] = [
  'pending',
  'met',
  'missing',
  'na',
];

const ALL_DEAL_STATUSES: readonly DealStatus[] = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
  'completed',
  'blocked',
  'defaulted',
];

type RowOverride = {
  status?: DeliverableStatus;
  required?: boolean;
  evidenceRef?: string | null;
  note?: string | null;
};

/** 五条件行；`patch` 按 kind 覆写。缺省全部 met + required（= 可放款基线）。 */
function rows(
  patch: Partial<Record<DeliverableKind, RowOverride>> = {},
): DeliveryCheckInput['deliverables'] {
  return DELIVERABLE_KINDS.map((kind) => ({
    kind,
    status: patch[kind]?.status ?? ('met' as DeliverableStatus),
    required: patch[kind]?.required ?? true,
    evidenceRef: patch[kind]?.evidenceRef ?? null,
    note: patch[kind]?.note ?? null,
  }));
}

function input(
  patch: Partial<Record<DeliverableKind, RowOverride>> = {},
  dealStatus: DealStatus = 'delivering',
  deliverables?: DeliveryCheckInput['deliverables'],
): DeliveryCheckInput {
  return {
    deal: { id: 'deal-1', status: dealStatus },
    deliverables: deliverables ?? rows(patch),
  };
}

// ───────────────────────── 契约与形状 ─────────────────────────

describe('checkDeliveryRow：返回契约', () => {
  it('conditions 恒五条且按 V7 台账列序（内容/Key/合同/托管/#ad）', () => {
    const r = checkDeliveryRow(input());
    expect(r.conditions.map((c) => c.kind)).toEqual([
      'content',
      'key',
      'contract',
      'escrow',
      'ad_disclosure',
    ]);
    expect(DELIVERABLE_KINDS).toHaveLength(5);
  });

  it('入参顺序打乱不改变输出序与结论（存在性判定与顺序无关）', () => {
    const shuffled = [...rows()].reverse();
    const a = checkDeliveryRow(input({}, 'delivering', shuffled));
    const b = checkDeliveryRow(input());
    expect(a.conditions.map((c) => c.kind)).toEqual(
      b.conditions.map((c) => c.kind),
    );
    expect(a.ready).toBe(b.ready);
  });

  it('byKind 与 conditions 同源（服务端按类取用与页面渲染不会分叉）', () => {
    const r = checkDeliveryRow(input({ contract: { status: 'missing' } }));
    for (const cell of r.conditions) {
      expect(r.byKind[cell.kind]).toBe(cell);
    }
  });

  it('纯函数：不修改入参、同输入同输出、返回全新对象', () => {
    const arg = input({ key: { status: 'na', required: false } });
    const snapshot = JSON.parse(JSON.stringify(arg));
    const a = checkDeliveryRow(arg);
    const b = checkDeliveryRow(arg);
    expect(JSON.parse(JSON.stringify(arg))).toEqual(snapshot);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.gaps).not.toBe(b.gaps);
  });

  it('缺失字段一律 null，不填 空串/0 冒充（D2 渲染契约）', () => {
    const r = checkDeliveryRow(input());
    for (const cell of r.conditions) {
      expect(cell.evidenceRef).toBeNull();
      expect(cell.note).toBeNull();
    }
  });

  it('evidenceRef / note 原样透传（V7 🔒 note 条件渲染的数据源）', () => {
    const r = checkDeliveryRow(
      input({
        contract: {
          status: 'missing',
          note: '合同待补签',
          evidenceRef: 'sign-0001',
        },
      }),
    );
    expect(r.byKind.contract.note).toBe('合同待补签');
    expect(r.byKind.contract.evidenceRef).toBe('sign-0001');
    // 缺口条目带上同一附注，调用方「缺什么显什么」不必回查
    expect(r.gaps).toContainEqual({
      kind: 'contract',
      reason: 'MISSING',
      note: '合同待补签',
    });
  });
});

// ───────────────────────── 全矩阵：五条件 × 四态 ─────────────────────────

describe('全矩阵：五条件 × 四态（required=true）', () => {
  const expectedCell: Record<DeliverableStatus, DeliveryCondition> = {
    met: 'ok',
    missing: 'miss',
    na: 'na',
    pending: 'miss', // required 下未开始 = 尚未满足，按「缺」显示
  };

  for (const kind of DELIVERABLE_KINDS) {
    for (const status of ALL_STATUSES) {
      it(`${kind} × ${status} → cell=${expectedCell[status]} · ready=${status === 'met'}`, () => {
        const r = checkDeliveryRow(input({ [kind]: { status } }));
        expect(r.byKind[kind].cell).toBe(expectedCell[status]);
        expect(r.byKind[kind].status).toBe(status);
        expect(r.ready).toBe(status === 'met');
      });
    }
  }

  it('🔒 三态不得压二态：na 与 miss 在同一结果里可区分', () => {
    const r = checkDeliveryRow(
      input({
        key: { status: 'na', required: false },
        contract: { status: 'missing' },
      }),
    );
    expect(r.byKind.key.cell).toBe('na');
    expect(r.byKind.contract.cell).toBe('miss');
    expect(new Set(r.conditions.map((c) => c.cell))).toEqual(
      new Set(['ok', 'na', 'miss']),
    );
  });
});

describe('全矩阵：required=false × 四态', () => {
  const expectedCell: Record<DeliverableStatus, DeliveryCondition> = {
    met: 'ok',
    missing: 'miss',
    na: 'na',
    pending: 'na', // 非必需且未开始 → 「不适用」而非「缺」（D2 诚实语义）
  };

  for (const status of ALL_STATUSES) {
    it(`key(required=false) × ${status} → cell=${expectedCell[status]} · 恒不阻断 ready`, () => {
      const r = checkDeliveryRow(input({ key: { status, required: false } }));
      expect(r.byKind.key.cell).toBe(expectedCell[status]);
      expect(r.ready).toBe(true);
      expect(r.gaps).toEqual([]);
    });
  }
});

// ───────────────────────── ready 判定（正例 / 负例）─────────────────────────

describe('ready 判定', () => {
  it('正例：五条件全 met → ready=true 且 gaps 为空', () => {
    const r = checkDeliveryRow(input());
    expect(r.ready).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it('正例：na 不计入 ready（无 key 交付的合作照样可放款，P3）', () => {
    const r = checkDeliveryRow(input({ key: { status: 'na', required: false } }));
    expect(r.byKind.key.cell).toBe('na');
    expect(r.ready).toBe(true);
  });

  it('负例：任一必需条件 missing 阻断 ready', () => {
    for (const kind of DELIVERABLE_KINDS) {
      const r = checkDeliveryRow(input({ [kind]: { status: 'missing' } }));
      expect(r.ready).toBe(false);
      expect(r.gaps).toContainEqual({ kind, reason: 'MISSING', note: null });
    }
  });

  it('负例：必需条件 pending 阻断 ready（未核验 ≠ 已满足）', () => {
    const r = checkDeliveryRow(input({ escrow: { status: 'pending' } }));
    expect(r.ready).toBe(false);
    expect(r.gaps).toContainEqual({
      kind: 'escrow',
      reason: 'PENDING',
      note: null,
    });
  });

  it('负例：required=true 却标 na = 数据异常 → fail-safe 阻断（NA_BUT_REQUIRED）', () => {
    const r = checkDeliveryRow(input({ ad_disclosure: { status: 'na' } }));
    expect(r.byKind.ad_disclosure.cell).toBe('na');
    expect(r.ready).toBe(false);
    expect(r.gaps).toContainEqual({
      kind: 'ad_disclosure',
      reason: 'NA_BUT_REQUIRED',
      note: null,
    });
  });

  it('负例：条件行整类缺失 → fail-safe 阻断（ROW_ABSENT）且单元显示 miss', () => {
    const partial = rows().filter((r) => r.kind !== 'escrow');
    const r = checkDeliveryRow(input({}, 'delivering', partial));
    expect(r.conditions).toHaveLength(5); // 仍恒五条，缺行也占位
    expect(r.byKind.escrow.status).toBeNull(); // 与「有行且 pending」可区分
    expect(r.byKind.escrow.cell).toBe('miss');
    expect(r.ready).toBe(false);
    expect(r.gaps).toContainEqual({
      kind: 'escrow',
      reason: 'ROW_ABSENT',
      note: null,
    });
  });

  it('负例：空 deliverables → 五条 ROW_ABSENT 全阻断（不得乐观放行）', () => {
    const r = checkDeliveryRow(input({}, 'delivering', []));
    expect(r.ready).toBe(false);
    expect(r.gaps).toHaveLength(5);
    expect(r.gaps.every((g) => g.reason === 'ROW_ABSENT')).toBe(true);
  });

  it('多条件同时缺 → 缺口逐条列出（调用方可逐条渲染，不是一句「不齐」）', () => {
    const r = checkDeliveryRow(
      input({
        content: { status: 'missing', note: '终稿未交' },
        ad_disclosure: { status: 'pending' },
      }),
    );
    expect(r.gaps).toEqual([
      { kind: 'content', reason: 'MISSING', note: '终稿未交' },
      { kind: 'ad_disclosure', reason: 'PENDING', note: null },
    ]);
  });
});

describe('Deal 状态对 ready 的作用', () => {
  for (const status of ALL_DEAL_STATUSES) {
    const payable = status !== 'blocked' && status !== 'defaulted';
    it(`Deal=${status} + 条件全齐 → ready=${payable}`, () => {
      const r = checkDeliveryRow(input({}, status));
      expect(r.ready).toBe(payable);
      expect(r.dealStatus).toBe(status);
    });
  }

  it('blocked / defaulted 的缺口条目 kind=null（Deal 级而非条件级）', () => {
    expect(checkDeliveryRow(input({}, 'blocked')).gaps).toEqual([
      { kind: null, reason: 'DEAL_BLOCKED', note: null },
    ]);
    expect(checkDeliveryRow(input({}, 'defaulted')).gaps).toEqual([
      { kind: null, reason: 'DEAL_DEFAULTED', note: null },
    ]);
  });
});

describe('conditionCellOf（单元映射，供调用方复用同一映射不自行内联）', () => {
  it('required=true 四态映射', () => {
    expect(conditionCellOf('met', true)).toBe('ok');
    expect(conditionCellOf('missing', true)).toBe('miss');
    expect(conditionCellOf('na', true)).toBe('na');
    expect(conditionCellOf('pending', true)).toBe('miss');
  });
  it('required=false 下 pending 落 na（其余不变）', () => {
    expect(conditionCellOf('pending', false)).toBe('na');
    expect(conditionCellOf('met', false)).toBe('ok');
    expect(conditionCellOf('missing', false)).toBe('miss');
    expect(conditionCellOf('na', false)).toBe('na');
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6，acceptance 4）

   目的不是再测一遍判定，而是测【上面那些断言本身有没有检测力】。
   做法：把 ready 不变量各造一个「破坏判定规则」的变异体，用同一组行为断言去跑——
   真实实现必须全过、每个变异体必须至少挂一条。变异体也全过 = 断言是死的。
   ──────────────────────────────────────────────────────────────── */

type CheckFn = (i: DeliveryCheckInput) => DeliveryCheckResult;

/** 同一组行为断言，可作用在任意「交付条件核对」实现上。抛错即视为翻红。 */
function deliveryBehaviourSuite(check: CheckFn): void {
  // 1) 正例：全 met → 可放款
  if (!check(input()).ready) {
    throw new Error('五条件全 met 却判不可放款');
  }
  // 2) na 不计入 ready（无 key 交付的合作不该被卡住）
  if (!check(input({ key: { status: 'na', required: false } })).ready) {
    throw new Error('required=false 的 na 行阻断了 ready');
  }
  // 3) missing 阻断 ready（最要命的退化方向：缺条件也放款）
  if (check(input({ contract: { status: 'missing' } })).ready) {
    throw new Error('必需条件 missing 仍判可放款');
  }
  // 4) pending 阻断 ready（未核验 ≠ 已满足）
  if (check(input({ escrow: { status: 'pending' } })).ready) {
    throw new Error('必需条件 pending 仍判可放款');
  }
  // 5) na 不得被压成 met（把「不适用」当「已满足」= 悄悄放宽必需条件）
  if (check(input({ ad_disclosure: { status: 'na' } })).ready) {
    throw new Error('required=true 的 na 被当成已满足');
  }
  // 6) 缺口清单必须逐条可分支（静默 ready=false 让调用方无从「缺什么显什么」）
  const gapped = check(input({ content: { status: 'missing' } }));
  if (!gapped.gaps.some((g) => g.kind === 'content' && g.reason === 'MISSING')) {
    throw new Error('缺口清单未逐条列出 content/MISSING');
  }
  // 7) 三态不得压二态（na 与 miss 必须可区分）
  const tri = check(
    input({
      key: { status: 'na', required: false },
      contract: { status: 'missing' },
    }),
  );
  if (tri.byKind.key.cell === tri.byKind.contract.cell) {
    throw new Error('na 与 miss 被压成同一态');
  }
  // 8) 条件行缺失 fail-safe 阻断（数据不全不得乐观放行）
  if (check(input({}, 'delivering', [])).ready) {
    throw new Error('零条件行仍判可放款');
  }
  // 9) blocked / defaulted 的 Deal 条件再齐也不放
  if (check(input({}, 'blocked')).ready || check(input({}, 'defaulted')).ready) {
    throw new Error('blocked/defaulted 的 Deal 判成可放款');
  }
}

describe('D20 变异测试：破坏判定规则 → 同一组断言必须翻红', () => {
  it('真实实现通过整组行为断言', () => {
    expect(() => deliveryBehaviourSuite(checkDeliveryRow)).not.toThrow();
  });

  it('变异体 A：na 压成 met（不适用当已满足）→ 翻红', () => {
    // 变异：required=true 的 na 被视为满足——「不适用」悄悄变成「已齐」，
    // 必需条件被绕过，资金闸门失效。
    const mutant: CheckFn = (i) =>
      checkDeliveryRow({
        ...i,
        deliverables: i.deliverables.map((d) =>
          d.status === 'na' ? { ...d, status: 'met' as const } : d,
        ),
      });
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 B：missing 放行（缺条件也可放款）→ 翻红', () => {
    // 变异：ready 只看「没有 pending」，missing 被漏判——FR-8.2.4.2 的反面。
    const mutant: CheckFn = (i) => {
      const real = checkDeliveryRow(i);
      const onlyMissing =
        real.gaps.length > 0 && real.gaps.every((g) => g.reason === 'MISSING');
      return onlyMissing ? { ...real, ready: true } : real;
    };
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 C：pending 视同已满足 → 翻红', () => {
    // 变异：「还没核验」被当作「已满足」——乐观退化，最容易在重构中悄悄发生。
    const mutant: CheckFn = (i) =>
      checkDeliveryRow({
        ...i,
        deliverables: i.deliverables.map((d) =>
          d.status === 'pending' ? { ...d, status: 'met' as const } : d,
        ),
      });
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 D：三态压二态（na 并入 miss）→ 翻红', () => {
    // 变异：V7 §2.3 明令禁止的简化——「不适用」与「缺」混为一谈。
    const mutant: CheckFn = (i) => {
      const real = checkDeliveryRow(i);
      const conditions = real.conditions.map((c) =>
        c.cell === 'na' ? { ...c, cell: 'miss' as const } : c,
      );
      const byKind = { ...real.byKind };
      for (const c of conditions) byKind[c.kind] = c;
      return { ...real, conditions, byKind };
    };
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 E：缺口清单被清空（只给 ready 布尔）→ 翻红', () => {
    // 变异：结论对但缺口不列——V7「缺什么显什么」与 payout 拒绝原因都无从渲染。
    const mutant: CheckFn = (i) => ({ ...checkDeliveryRow(i), gaps: [] });
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 F：条件行缺失当作不适用（乐观放行）→ 翻红', () => {
    // 变异：ROW_ABSENT 不阻断——五行没建全的 Deal 直接可放款，
    // 资金闸门的 fail-safe 方向被反转成 fail-open。
    const mutant: CheckFn = (i) => {
      const real = checkDeliveryRow(i);
      const rest = real.gaps.filter((g) => g.reason !== 'ROW_ABSENT');
      return { ...real, gaps: rest, ready: rest.length === 0 };
    };
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 G：Deal blocked/defaulted 不影响放款 → 翻红', () => {
    // 变异：只看条件不看 Deal 状态——争议中/已违约的合作照样放款。
    const mutant: CheckFn = (i) => {
      const real = checkDeliveryRow(i);
      const rest = real.gaps.filter((g) => g.kind != null);
      return { ...real, gaps: rest, ready: rest.length === 0 };
    };
    expect(() => deliveryBehaviourSuite(mutant)).toThrow();
  });
});
