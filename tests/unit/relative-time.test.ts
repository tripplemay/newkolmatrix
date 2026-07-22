// M1-C F003 — 相对时间展示串单测（纯函数，now 注入可穷举）。

import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from 'lib/display/relative-time';

const NOW = new Date('2026-07-22T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('formatRelativeTime', () => {
  it('一分钟内 → 刚刚', () => {
    expect(formatRelativeTime(ago(30_000), NOW)).toBe('刚刚');
  });

  it('分钟 / 小时档', () => {
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe('5 分钟前');
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe('3 小时前');
  });

  it('昨天 / N 天前 / 超一周落日期', () => {
    expect(formatRelativeTime(ago(24 * 3_600_000), NOW)).toBe('昨天');
    expect(formatRelativeTime(ago(3 * 24 * 3_600_000), NOW)).toBe('3 天前');
    const old = new Date('2026-07-01T12:00:00Z');
    expect(formatRelativeTime(old, NOW)).toBe('7-01');
  });

  it('未来时间（时钟漂移脏数据）宽松归「刚刚」，不抛错（D2）', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 60_000), NOW)).toBe(
      '刚刚',
    );
  });
});
