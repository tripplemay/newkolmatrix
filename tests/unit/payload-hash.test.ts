// M3-A fix_round1 — payloadHash undefined-键中毒回归单测（验收 F002/F008 critical）
//
// 修复前失败形态：stableStringify 把显式 undefined 键序列化为 `"key":undefined` 参与建卡
// hash，而 Prisma 写 JSONB 丢弃 undefined 键 → confirm/execute 按库内读回复算必不匹配。
// 修复后不变量：payloadHashOf 严格对齐 JSON/JSONB 往返语义——
//   hash(含 undefined 值键的对象) === hash(JSON.parse(JSON.stringify(同对象)))。

import { describe, expect, it } from 'vitest';
import { payloadHashOf } from '../../src/lib/agent/gate/gate';

const T = 'tenant-x';

describe('payloadHashOf 与 JSON/JSONB 往返语义对齐（fix_round1 回归）', () => {
  it('显式 undefined 值键 = 键不存在（修复前此断言必红）', () => {
    const withUndef = {
      projectId: 'p',
      kolId: 'k',
      subject: 's',
      body: 'b',
      language: undefined as string | undefined,
    };
    const without = { projectId: 'p', kolId: 'k', subject: 's', body: 'b' };
    expect(payloadHashOf('send_outreach', withUndef, T)).toBe(
      payloadHashOf('send_outreach', without, T),
    );
  });

  it('hash(input) === hash(JSON 往返(input))——JSONB 存储不再改变哈希', () => {
    const input: Record<string, unknown> = {
      a: 1,
      b: undefined as unknown,
      nested: {
        x: undefined as unknown,
        y: 'v',
        arr: [1, undefined, { z: undefined as unknown, w: 2 }],
      },
    };
    const roundTripped = JSON.parse(JSON.stringify(input));
    expect(payloadHashOf('t', input, T)).toBe(
      payloadHashOf('t', roundTripped, T),
    );
  });

  it('数组中的 undefined 元素按 JSON 语义序列化为 null（长度语义保持）', () => {
    expect(payloadHashOf('t', { arr: [1, undefined, 3] }, T)).toBe(
      payloadHashOf('t', { arr: [1, null, 3] }, T),
    );
    // 且不等于删除元素（数组长度是语义的一部分）
    expect(payloadHashOf('t', { arr: [1, undefined, 3] }, T)).not.toBe(
      payloadHashOf('t', { arr: [1, 3] }, T),
    );
  });

  it('key 顺序无关（原有不变量不回退）+ 语义不同则哈希不同', () => {
    expect(payloadHashOf('t', { a: 1, b: 2 }, T)).toBe(
      payloadHashOf('t', { b: 2, a: 1 }, T),
    );
    expect(payloadHashOf('t', { a: 1 }, T)).not.toBe(
      payloadHashOf('t', { a: 2 }, T),
    );
    expect(payloadHashOf('t', { a: null }, T)).not.toBe(
      payloadHashOf('t', {}, T),
    ); // null ≠ 键不存在
  });
});
