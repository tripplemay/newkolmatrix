// M3-A-REACH-CRM F005 — domain/crm-infer.ts 单测 + D20 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6，env-guards.test.ts 先例）：断言验【行为】不验源码关键字，
// 且必须证明检测器活性——破坏推断规则的变异体在同一组断言下必须翻红。
// 若变异体也能全过，说明这组断言根本没在测不变量。

import { describe, it, expect } from 'vitest';
import {
  inferCrmStatus,
  reachStatusIndex,
  REACH_STATUS_ORDER,
  OVERRIDABLE_STATUSES,
  MANUAL_OVERRIDE_SIGNAL_TYPE,
  EMAIL_REPLY_SIGNAL_TYPE,
  type CrmInferContext,
  type CrmInferResult,
  type CrmMessageDirection,
  type CrmQuoteStatus,
  type CrmSignalInput,
  type ReachStatus,
} from '../../src/lib/domain/crm-infer';

// ───────────────────────── fixtures ─────────────────────────

let seq = 0;

function msg(direction: CrmMessageDirection) {
  return { direction };
}

function quote(status: CrmQuoteStatus) {
  return { status };
}

/** manual_override 信号。`at` 缺省取递增时刻，保证「最新」语义确定。 */
function override(
  status: string,
  at?: string,
  payloadOverride?: unknown,
): CrmSignalInput {
  seq += 1;
  return {
    id: `sig-${seq}`,
    type: MANUAL_OVERRIDE_SIGNAL_TYPE,
    detectedAt: at ? new Date(at) : new Date(2026, 6, 1, 0, 0, seq),
    payload: payloadOverride !== undefined ? payloadOverride : { status },
  };
}

/** 非 override 的杂项信号（投递状态等）。 */
function signal(type: string, payload: unknown = {}): CrmSignalInput {
  seq += 1;
  return {
    id: `sig-${seq}`,
    type,
    detectedAt: new Date(2026, 6, 1, 0, 0, seq),
    payload,
  };
}

function ctx(over: Partial<CrmInferContext> = {}): CrmInferContext {
  return { messages: [], signals: [], quotes: [], ...over };
}

/**
 * 五个事件面状态的构造配方（全转换矩阵的「行」）。
 * 每个配方只用事件面实物（消息/报价/回复信号），不含 override。
 */
const EVENT_FIXTURES: Record<ReachStatus, () => CrmInferContext> = {
  pending_send: () => ctx({ messages: [msg('draft')] }),
  sent: () => ctx({ messages: [msg('draft'), msg('sent')] }),
  replied: () => ctx({ messages: [msg('sent'), msg('inbound')] }),
  negotiating: () =>
    ctx({ messages: [msg('sent'), msg('inbound')], quotes: [quote('proposed')] }),
  confirmed: () =>
    ctx({
      messages: [msg('sent'), msg('inbound')],
      quotes: [quote('proposed'), quote('committed')],
    }),
};

// ───────────────────────── 事件面地板 ─────────────────────────

describe('事件面推断：五态地板（spec §4/§5 + architecture :491）', () => {
  it('空 thread → 基线 pending_send', () => {
    const r = inferCrmStatus(ctx());
    expect(r.status).toBe('pending_send');
    expect(r.eventStatus).toBe('pending_send');
    expect(r.override).toBeNull();
    expect(r.ignoredOverrides).toEqual([]);
  });

  it('仅 draft 消息 → 仍 pending_send（草稿不是发送）', () => {
    expect(inferCrmStatus(ctx({ messages: [msg('draft')] })).status).toBe(
      'pending_send',
    );
  });

  it('存在 direction=sent 消息 → sent', () => {
    expect(
      inferCrmStatus(ctx({ messages: [msg('draft'), msg('sent')] })).status,
    ).toBe('sent');
  });

  it('存在 direction=inbound 消息 → replied', () => {
    expect(
      inferCrmStatus(ctx({ messages: [msg('sent'), msg('inbound')] })).status,
    ).toBe('replied');
  });

  it('存在 email_reply 信号 → replied（前向兼容：M3-B 真入站零改动）', () => {
    const r = inferCrmStatus(
      ctx({
        messages: [msg('sent')],
        signals: [signal(EMAIL_REPLY_SIGNAL_TYPE)],
      }),
    );
    expect(r.status).toBe('replied');
  });

  it('email_delivery_status 信号不推进状态（投递状态 ≠ 回复）', () => {
    for (const event of ['delivered', 'bounced', 'opened', 'complained']) {
      const r = inferCrmStatus(
        ctx({
          messages: [msg('sent')],
          signals: [signal('email_delivery_status', { event })],
        }),
      );
      expect(r.status, `event=${event}`).toBe('sent');
      expect(r.ignoredOverrides).toEqual([]); // 非 override 信号不入留痕
    }
  });

  it('存在 proposed quote → negotiating', () => {
    expect(inferCrmStatus(ctx({ quotes: [quote('proposed')] })).status).toBe(
      'negotiating',
    );
  });

  it('仅 rejected quote → 仍 negotiating（行的存在蕴含「曾进入谈判」）', () => {
    expect(inferCrmStatus(ctx({ quotes: [quote('rejected')] })).status).toBe(
      'negotiating',
    );
  });

  it('存在 committed quote → confirmed（U4 唯一路径）', () => {
    expect(
      inferCrmStatus(ctx({ quotes: [quote('proposed'), quote('committed')] }))
        .status,
    ).toBe('confirmed');
  });

  it('事件面存在性判定与数组顺序无关', () => {
    const a = inferCrmStatus(
      ctx({ messages: [msg('inbound'), msg('sent'), msg('draft')] }),
    );
    const b = inferCrmStatus(
      ctx({ messages: [msg('draft'), msg('sent'), msg('inbound')] }),
    );
    expect(a.status).toBe(b.status);
  });

  it('五个事件配方各自推出对应状态（矩阵行的自洽前提）', () => {
    for (const s of REACH_STATUS_ORDER) {
      const r = inferCrmStatus(EVENT_FIXTURES[s]());
      expect(r.eventStatus, `fixture=${s}`).toBe(s);
      expect(r.status, `fixture=${s}`).toBe(s);
    }
  });
});

// ───────────────────────── 全转换矩阵（acceptance 2）─────────────────────────

describe('全转换矩阵：5 事件状态 × 6 覆盖档（none + 五态断言）穷举', () => {
  // 期望规则：合法断言（U4 三态）→ max 合成；confirmed / pending_send 断言 → 忽略且留痕；
  // none → 事件面原值。
  for (const eventState of REACH_STATUS_ORDER) {
    it(`event=${eventState}：无 override → ${eventState}`, () => {
      expect(inferCrmStatus(EVENT_FIXTURES[eventState]()).status).toBe(
        eventState,
      );
    });

    for (const asserted of OVERRIDABLE_STATUSES) {
      const expected =
        reachStatusIndex(asserted) > reachStatusIndex(eventState)
          ? asserted
          : eventState;
      it(`event=${eventState} + override=${asserted} → ${expected}（max 合成）`, () => {
        const base = EVENT_FIXTURES[eventState]();
        const r = inferCrmStatus(
          ctx({ ...base, signals: [...base.signals, override(asserted)] }),
        );
        expect(r.status).toBe(expected);
        expect(r.eventStatus).toBe(eventState);
        expect(r.override?.asserted).toBe(asserted);
        expect(r.override?.effective).toBe(expected === asserted && expected !== eventState);
        expect(r.ignoredOverrides).toEqual([]);
      });
    }

    it(`event=${eventState} + override=confirmed → ${eventState}（越权忽略 + 留痕）`, () => {
      const base = EVENT_FIXTURES[eventState]();
      const sig = override('confirmed');
      const r = inferCrmStatus(
        ctx({ ...base, signals: [...base.signals, sig] }),
      );
      expect(r.status).toBe(eventState);
      expect(r.override).toBeNull();
      expect(r.ignoredOverrides).toEqual([
        {
          signalId: sig.id,
          asserted: 'confirmed',
          reason: 'CONFIRMED_NOT_OVERRIDABLE',
          detectedAt: sig.detectedAt,
        },
      ]);
    });

    it(`event=${eventState} + override=pending_send → ${eventState}（不在 U4 白名单，留痕）`, () => {
      const base = EVENT_FIXTURES[eventState]();
      const r = inferCrmStatus(
        ctx({ ...base, signals: [...base.signals, override('pending_send')] }),
      );
      expect(r.status).toBe(eventState);
      expect(r.ignoredOverrides).toHaveLength(1);
      expect(r.ignoredOverrides[0].reason).toBe('STATUS_NOT_OVERRIDABLE');
    });
  }

  it('性质断言：无 committed quote 时，任何 override 组合都到不了 confirmed（U4 唯一路径）', () => {
    const assertions = [...REACH_STATUS_ORDER, 'CONFIRMED', 'banana', ''];
    for (const eventState of REACH_STATUS_ORDER.filter(
      (s) => s !== 'confirmed',
    )) {
      for (const asserted of assertions) {
        const base = EVENT_FIXTURES[eventState]();
        const r = inferCrmStatus(
          ctx({ ...base, signals: [...base.signals, override(asserted)] }),
        );
        expect(
          r.status,
          `event=${eventState} asserted=${asserted}`,
        ).not.toBe('confirmed');
      }
    }
  });
});

// ───────────────────────── override 合成细则 ─────────────────────────

describe('manual_override 合成：取 detectedAt 最新的合法一条', () => {
  it('多条合法 override → 最新者生效（与数组顺序无关）', () => {
    const early = override('negotiating', '2026-07-01T10:00:00Z');
    const late = override('replied', '2026-07-02T10:00:00Z');
    const base = ctx({ messages: [msg('sent')] });
    for (const signals of [
      [early, late],
      [late, early],
    ]) {
      const r = inferCrmStatus({ ...base, signals });
      expect(r.status).toBe('replied');
      expect(r.override?.signalId).toBe(late.id);
    }
  });

  it('同一时刻两条合法 override → 输入序靠后者生效（确定性）', () => {
    const a = override('replied', '2026-07-01T10:00:00Z');
    const b = override('negotiating', '2026-07-01T10:00:00Z');
    const r = inferCrmStatus(ctx({ messages: [msg('sent')], signals: [a, b] }));
    expect(r.override?.signalId).toBe(b.id);
    expect(r.status).toBe('negotiating');
  });

  it('最新一条是越权 confirmed → 不掩盖更早的合法断言：合法者照常生效，越权者留痕', () => {
    const valid = override('negotiating', '2026-07-01T10:00:00Z');
    const sneak = override('confirmed', '2026-07-03T10:00:00Z');
    const r = inferCrmStatus(
      ctx({ messages: [msg('sent')], signals: [valid, sneak] }),
    );
    expect(r.status).toBe('negotiating');
    expect(r.override?.signalId).toBe(valid.id);
    expect(r.ignoredOverrides).toHaveLength(1);
    expect(r.ignoredOverrides[0]).toMatchObject({
      signalId: sneak.id,
      asserted: 'confirmed',
      reason: 'CONFIRMED_NOT_OVERRIDABLE',
    });
  });

  it('override 断言落后于事件面 → 事件面立住（不降级），effective=false', () => {
    const r = inferCrmStatus(
      ctx({ quotes: [quote('proposed')], signals: [override('sent')] }),
    );
    expect(r.status).toBe('negotiating');
    expect(r.eventStatus).toBe('negotiating');
    expect(r.override?.asserted).toBe('sent');
    expect(r.override?.effective).toBe(false);
  });

  it('payload 形状非法（缺 status / 非对象 / status 非字符串）→ MALFORMED_OVERRIDE 留痕', () => {
    const cases: unknown[] = [null, 'replied', 42, {}, { status: 7 }, []];
    for (const payload of cases) {
      const sig = override('_', undefined, payload);
      const r = inferCrmStatus(ctx({ signals: [sig] }));
      expect(r.status, JSON.stringify(payload)).toBe('pending_send');
      expect(r.ignoredOverrides).toHaveLength(1);
      expect(r.ignoredOverrides[0]).toMatchObject({
        signalId: sig.id,
        reason: 'MALFORMED_OVERRIDE',
      });
    }
  });

  it('未知状态字符串 → MALFORMED_OVERRIDE，且原样保留断言值供留痕', () => {
    const r = inferCrmStatus(ctx({ signals: [override('banana')] }));
    expect(r.status).toBe('pending_send');
    expect(r.ignoredOverrides[0]).toMatchObject({
      asserted: 'banana',
      reason: 'MALFORMED_OVERRIDE',
    });
  });

  it('三种忽略理由互相可区分（调用方留痕分支的依据）', () => {
    const reasons = new Set(
      [override('confirmed'), override('pending_send'), override('banana')].map(
        (sig) => inferCrmStatus(ctx({ signals: [sig] })).ignoredOverrides[0].reason,
      ),
    );
    expect(reasons.size).toBe(3);
  });
});

// ───────────────────────── 纯函数性（acceptance 1）─────────────────────────

describe('纯函数性：无 IO、不改入参、同输入同输出', () => {
  it('入参深冻结也能正常运行（函数不写入参）', () => {
    const sig = override('replied');
    const input = ctx({
      messages: [msg('sent')],
      signals: [sig],
      quotes: [quote('proposed')],
    });
    input.messages.forEach((m) => Object.freeze(m));
    input.signals.forEach((s) => Object.freeze(s));
    input.quotes.forEach((q) => Object.freeze(q));
    Object.freeze(input.messages);
    Object.freeze(input.signals);
    Object.freeze(input.quotes);
    Object.freeze(input);
    expect(() => inferCrmStatus(input)).not.toThrow();
  });

  it('同一输入两次调用 → 深等的全新结果对象', () => {
    const input = ctx({
      messages: [msg('sent')],
      signals: [override('negotiating')],
    });
    const a = inferCrmStatus(input);
    const b = inferCrmStatus(input);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.ignoredOverrides).not.toBe(b.ignoredOverrides);
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6，acceptance 4）

   目的不是再测一遍推断，而是测【上面那些断言本身有没有检测力】。
   做法：把 U4 不变量各造一个「破坏推断规则」的变异体（env-guards.test.ts
   同款：用行为等价的方式模拟变异），用同一组行为断言去跑——
   真实实现必须全过、每个变异体必须至少挂一条。变异体也全过 = 断言是死的。
   ──────────────────────────────────────────────────────────────── */

type InferFn = (c: CrmInferContext) => CrmInferResult;

/** 同一组行为断言，可作用在任意「五态推断」实现上。抛错即视为翻红。 */
function crmBehaviourSuite(infer: InferFn): void {
  // 1) 基线
  if (infer(ctx()).status !== 'pending_send') {
    throw new Error('空 thread 基线不是 pending_send');
  }
  // 2) 事件地板
  if (infer(ctx({ messages: [msg('sent')] })).status !== 'sent') {
    throw new Error('sent 消息未推出 sent');
  }
  // 3) confirmed 唯一路径（正向）
  if (infer(ctx({ quotes: [quote('committed')] })).status !== 'confirmed') {
    throw new Error('committed quote 未推出 confirmed');
  }
  // 4) U4 越权：override 断言 confirmed 必须被忽略……
  const sneak = infer(
    ctx({ messages: [msg('sent')], signals: [override('confirmed')] }),
  );
  if (sneak.status === 'confirmed') {
    throw new Error('manual_override 越权断言 confirmed 生效了');
  }
  // ……且必须留痕（静默丢弃 = 调用方无从写 OperationLog）
  if (
    !sneak.ignoredOverrides.some(
      (i) => i.reason === 'CONFIRMED_NOT_OVERRIDABLE',
    )
  ) {
    throw new Error('越权 confirmed 覆盖被静默丢弃，未留痕');
  }
  // 5) 合法 override 生效（U4 三态覆盖是真能力，不是摆设）
  if (
    infer(ctx({ messages: [msg('sent')], signals: [override('negotiating')] }))
      .status !== 'negotiating'
  ) {
    throw new Error('合法 override（negotiating）未生效');
  }
  // 6) 不降级：override 不能把状态拉回库内事实之前
  if (
    infer(ctx({ quotes: [quote('proposed')], signals: [override('sent')] }))
      .status !== 'negotiating'
  ) {
    throw new Error('override 把状态降到了库内事实（proposed quote）之前');
  }
}

describe('D20 变异测试：破坏推断规则 → 同一组断言必须翻红', () => {
  it('真实实现通过整组行为断言', () => {
    expect(() => crmBehaviourSuite(inferCrmStatus)).not.toThrow();
  });

  it('变异体 A：manual_override 可断言 confirmed → 翻红', () => {
    // 变异：把「越权忽略」改成「照单全收」——U4 最要命的退化方向：
    // confirmed 可被人工标出，commit_quote 闸门形同虚设。
    const mutant: InferFn = (c) => {
      const real = inferCrmStatus(c);
      const sneaked = real.ignoredOverrides.some(
        (i) => i.reason === 'CONFIRMED_NOT_OVERRIDABLE',
      );
      if (!sneaked) return real;
      return {
        ...real,
        status: 'confirmed',
        ignoredOverrides: real.ignoredOverrides.filter(
          (i) => i.reason !== 'CONFIRMED_NOT_OVERRIDABLE',
        ),
      };
    };
    expect(() => crmBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 B：committed quote 不再推出 confirmed → 翻红', () => {
    // 变异：唯一路径被掐断（committed 视同 proposed）
    const mutant: InferFn = (c) =>
      inferCrmStatus({
        ...c,
        quotes: c.quotes.map((q) =>
          q.status === 'committed' ? { ...q, status: 'proposed' as const } : q,
        ),
      });
    expect(() => crmBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 C：越权覆盖被静默丢弃（不留痕）→ 翻红', () => {
    // 变异：状态判定还对，但 ignoredOverrides 恒空——调用方永远无从留痕。
    // 这条守的是 acceptance 3 的实质：留痕信息是返回契约的一部分，不是锦上添花。
    const mutant: InferFn = (c) => ({
      ...inferCrmStatus(c),
      ignoredOverrides: [],
    });
    expect(() => crmBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 D：override 直接生效（允许降级）→ 翻红', () => {
    // 变异：丢掉 max 合成，override 断言无条件覆盖事件面——
    // 五态 pill 会与库内实物（quote 行）互相矛盾。
    const mutant: InferFn = (c) => {
      const real = inferCrmStatus(c);
      if (real.override == null) return real;
      return { ...real, status: real.override.asserted };
    };
    expect(() => crmBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 E：基线不是 pending_send → 翻红', () => {
    // 变异：空 thread 被判成 sent（「没发过也算发过」的乐观退化）
    const mutant: InferFn = (c) => {
      const real = inferCrmStatus(c);
      return real.status === 'pending_send'
        ? { ...real, status: 'sent' }
        : real;
    };
    expect(() => crmBehaviourSuite(mutant)).toThrow();
  });
});
