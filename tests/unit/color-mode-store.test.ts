// M3-B-DELIVERY F012（BL-FE-16）— 模块级 store 单测：跨实例同步语义。
//
// 缺陷复现口径（backlog BL-FE-16）：改造前「一处 toggle，另一处收不到通知」。
// 本组断言正面钉死修复后的语义；末尾变异测试证明断言确有检测力
//（把 store 退化回「各持各的状态、不广播」，同一组断言必须翻红）。
//
// 仓内 vitest 是 node 环境、无 jsdom（vitest.config.ts 明文），故用 ColorModeTarget
// 替身驱动——store 的广播语义与浏览器实现解耦，正是为此分层。

import { describe, it, expect, vi } from 'vitest';
import {
  createColorModeStore,
  type ColorModeTarget,
} from '../../src/hooks/color-mode-store';

/** 替身宿主：内存持有 dark 态 + 手动触发外部变更（模拟 class 变动 / 别的标签页写入）。 */
function fakeTarget() {
  let dark = false;
  let onChange: (() => void) | null = null;
  let observeCount = 0;
  let unobserveCount = 0;
  return {
    target: {
      isDark: () => dark,
      apply: (next: boolean) => {
        dark = next;
      },
      observe: (cb: () => void) => {
        observeCount += 1;
        onChange = cb;
        return () => {
          unobserveCount += 1;
          onChange = null;
        };
      },
    } satisfies ColorModeTarget,
    /** 模拟外部改动（devtools 手改 body class / 另一标签页 storage 同步过来） */
    externalChange(next: boolean) {
      dark = next;
      onChange?.();
    },
    stats: () => ({ observeCount, unobserveCount, observing: onChange != null }),
  };
}

describe('跨实例同步（BL-FE-16 的实质）', () => {
  it('一处 setDark，另一处（纯读取方）收到通知', () => {
    const { target } = fakeTarget();
    const store = createColorModeStore(target);
    const reader = vi.fn();
    store.subscribe(reader);

    expect(store.getSnapshot()).toBe(false);
    store.setDark(true); // 另一个消费者（如 navbar）翻转
    expect(reader).toHaveBeenCalled(); // 纯读取方被通知
    expect(store.getSnapshot()).toBe(true);
  });

  it('toggle 同样广播，且多消费者全部收到', () => {
    const { target } = fakeTarget();
    const store = createColorModeStore(target);
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.subscribe(c);
    store.toggle();
    for (const fn of [a, b, c]) expect(fn).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(true);
    store.toggle();
    for (const fn of [a, b, c]) expect(fn).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toBe(false);
  });

  it('外部变更（class 被别处改 / 多标签页 storage 同步）同样广播', () => {
    const t = fakeTarget();
    const store = createColorModeStore(t.target);
    const reader = vi.fn();
    store.subscribe(reader);
    t.externalChange(true);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(true);
  });

  it('退订后不再收到通知；最后一个订阅者离开时取消底层监听（不留常驻句柄）', () => {
    const t = fakeTarget();
    const store = createColorModeStore(t.target);
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    const offB = store.subscribe(b);
    expect(t.stats().observeCount).toBe(1); // 只在第一个订阅者到来时监听一次

    offA();
    store.setDark(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(t.stats().observing).toBe(true); // 还有订阅者，监听保持

    offB();
    expect(t.stats().unobserveCount).toBe(1);
    expect(t.stats().observing).toBe(false);
  });

  it('重新订阅会重新建立底层监听（不是一次性）', () => {
    const t = fakeTarget();
    const store = createColorModeStore(t.target);
    store.subscribe(vi.fn())();
    const reader = vi.fn();
    store.subscribe(reader);
    expect(t.stats().observeCount).toBe(2);
    t.externalChange(true);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('监听者在回调中退订不影响其它监听者（遍历副本）', () => {
    const { target } = fakeTarget();
    const store = createColorModeStore(target);
    const second = vi.fn();
    const offFirst = store.subscribe(() => offFirst());
    store.subscribe(second);
    expect(() => store.setDark(true)).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('getServerSnapshot 恒浅色（SSR/pre-hydration 契约）', () => {
    const { target } = fakeTarget();
    const store = createColorModeStore(target);
    expect(store.getServerSnapshot()).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20）：证明上面的断言确有检测力
   ──────────────────────────────────────────────────────────────── */

type StoreLike = {
  subscribe(l: () => void): () => void;
  getSnapshot(): boolean;
  setDark(d: boolean): void;
  toggle(): void;
};

/** 同一组行为断言，可作用在任意「深浅色 store」实现上。抛错即视为翻红。 */
function syncBehaviourSuite(make: () => StoreLike): void {
  const store = make();
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  store.setDark(true);
  if (notified === 0) throw new Error('setDark 未广播——纯读取方收不到通知');
  if (store.getSnapshot() !== true) throw new Error('快照未反映最新状态');
  store.toggle();
  if (store.getSnapshot() !== false) throw new Error('toggle 未反转状态');
  if (notified < 2) throw new Error('toggle 未广播');
}

describe('D20 变异测试：退化回「各持各的状态」→ 断言必须翻红', () => {
  it('真实 store 通过整组行为断言', () => {
    expect(() =>
      syncBehaviourSuite(() => createColorModeStore(fakeTarget().target)),
    ).not.toThrow();
  });

  it('变异体 A：不广播（BL-FE-16 缺陷原貌）→ 翻红', () => {
    const mutant = (): StoreLike => {
      let dark = false;
      return {
        subscribe: () => () => undefined, // 订阅了个寂寞
        getSnapshot: () => dark,
        setDark: (d) => {
          dark = d;
        },
        toggle() {
          dark = !dark;
        },
      };
    };
    expect(() => syncBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 B：只在挂载时同步一次（快照冻结）→ 翻红', () => {
    const mutant = (): StoreLike => {
      const t = fakeTarget();
      const real = createColorModeStore(t.target);
      const frozen = real.getSnapshot();
      return { ...real, getSnapshot: () => frozen };
    };
    expect(() => syncBehaviourSuite(mutant)).toThrow();
  });
});
