// AGENT-FOUNDATION F010 — agent-canvas 视觉基线的确定性夹具
//
// 静态 KOL 候选（形状 = F005 search_kols 输出 SearchKolsOutput），供 /preview/agent-canvas 渲染。
// 视觉基线须确定性（不接活的 LLM/DB）——故用固定夹具，与 today/dashboard 基线同理。
// 数据虚构、仅供截图，不入库。

import type { SearchKolsOutput } from 'components/copilot/canvas/KolResultCards';

export const CANVAS_FIXTURE: SearchKolsOutput = {
  query: '坦克世界 题材游戏解说',
  count: 3,
  kols: [
    {
      id: 'fx-1',
      publicId: 'kol_fx_1',
      displayName: 'IronSight 铁瞄',
      platform: 'YouTube',
      handle: '@ironsight',
      profileUrl: 'https://example.com/ironsight',
      country: 'US',
      followers: 1_280_000,
      categories: ['坦克世界', '战争游戏', '硬核解说'],
      similarity: 0.94,
    },
    {
      id: 'fx-2',
      publicId: 'kol_fx_2',
      displayName: 'PanzerLine 装甲线',
      platform: 'Twitch',
      handle: '@panzerline',
      profileUrl: 'https://example.com/panzerline',
      country: 'DE',
      followers: 642_000,
      categories: ['坦克世界', '实况', '竞技'],
      similarity: 0.89,
    },
    {
      id: 'fx-3',
      publicId: 'kol_fx_3',
      displayName: '钢铁营地 SteelCamp',
      platform: 'YouTube',
      handle: '@steelcamp',
      profileUrl: 'https://example.com/steelcamp',
      country: 'CN',
      followers: 318_000,
      categories: ['坦克世界', '教学', '历史向'],
      similarity: 0.85,
    },
  ],
};

/** 静态交接夹具（形状对齐 HandoffCollab 的 HandoffRow，用于确定性可视化）。 */
export const HANDOFF_FIXTURE = {
  fromAgent: 'match',
  toAgent: 'reach',
  summary:
    '匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选（受众吻合、可信度已核），交触达 Agent 起草邀约。',
  artifactType: 'match_plan',
  artifactRef: 'match_plan:demo-starlight-protocol',
};
