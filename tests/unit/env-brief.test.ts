// M1-B-BRIEF F002 — brief 分流回归测试（D3）。
//
// 修复的线上真 bug：env-brief.ts 原实现四个 canonical 项目共享同一 canonicalBrief
// 引用（内容全是 xg《星轨协议》数据）——mf 头部显「萌宠农场 $7,500」而面内显
// xg 的「$11.5k 消耗 / 停在触达谈判」，两处打架。
//
// 修复前后可对比：修复前 getEnvBrief('mf') 返回 canonicalBrief（gauge.percent=64
// 等 xg 数据），下面的「五深字段全 null」断言必然失败；修复后仅 xg 可得 canonical。

import { describe, expect, it } from 'vitest';
import { getEnvBrief, briefGaugeSchema } from 'lib/data/mock/env-brief';

/** EnvBrief 的五个深字段名（D2 契约位） */
const DEEP_FIELDS = ['gauge', 'metrics', 'blocker', 'trend', 'timeline'] as const;

describe('getEnvBrief 按项目分流（D3 机械分流）', () => {
  it.each(['mf', 'lc', 'aw'])(
    '%s 无真数据源 → 五深字段全 null（不再是 xg 数据，优雅降级「待接入」）',
    (id) => {
      const brief = getEnvBrief(id);
      for (const f of DEEP_FIELDS) {
        expect(brief[f], `${id}.${f} 应为 null`).toBeNull();
      }
    },
  );

  it('xg 仍返回 canonical 面（内容出自《星轨协议》行，非空占位）', () => {
    const brief = getEnvBrief('xg');
    for (const f of DEEP_FIELDS) {
      expect(brief[f], `xg.${f} 不应为 null`).not.toBeNull();
    }
    // 锚定 canonical 的标志性数值（原型 L757 逐字：64% · 192万/300万）——
    // 防「非 null 但被换成别的项目数据」的假绿。
    const gauge = briefGaugeSchema.parse(brief.gauge);
    expect(gauge.percent).toBe(64);
    expect(gauge.sub).toBe('192万 / 300万 曝光');
  });

  it('旧 demo id 经 LEGACY_ID_ALIAS 归一到 xg → 仍 canonical（f007/f010 深链不回归）', () => {
    expect(getEnvBrief('starlight-protocol')).toEqual(getEnvBrief('xg'));
  });

  it('未知项目 → 全 null 深字段（既有 D2 行为不回归）', () => {
    const brief = getEnvBrief('no-such-project');
    for (const f of DEEP_FIELDS) {
      expect(brief[f]).toBeNull();
    }
  });
});
