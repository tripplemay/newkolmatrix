// ARCH-M05 F007 — 项目行 mock（原型 interaction-prototype-v2.html PROJECTS L546-558 逐字移植）
//
// 服务 V2 项目列表 + V3 详情外壳；AGENT-FOUNDATION 时代 components/project/demo-projects.ts
// 数据迁并扩展至此（原 3 条占位项目由原型 4 条 canonical 项目替代，旧 id 走 LEGACY_ID_ALIAS 兼容）。
// D2 渲染契约：缺失字段一律 null（页面渲染「待补充」占位），绝不填 0 / '' 冒充实测；
// URL 化状态位（?env=）是路由状态，不入 mock（mock 目录规则 #4）。

import type { Stage } from 'lib/agent/stage-routing';

/** 健康度三态（原型 .pill/.dot gd/wn/cr，不得压成二态） */
export type ProjectHealth = 'gd' | 'wn' | 'cr';

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  gd: '正常',
  wn: '注意',
  cr: '风险',
};

export interface MockProject {
  id: string;
  /** 项目全名（原型 p.name，含游戏名 + 营销主题） */
  name: string;
  /** 游戏名（avatar 色轮取首二字） */
  game: string;
  market: string;
  budget: string;
  /** D29 分工标记（非权限） */
  owner: string;
  health: ProjectHealth;
  /** 项目当前推进到的环节（rc-foot「停在「{环节}」」与导轨 done/进行中 判定） */
  cur: Stage;
  goal: string;
}

// 原型 PROJECTS（L546-558）：文案逐字。
export const mockProjects: MockProject[] = [
  {
    id: 'xg',
    name: '《星轨协议》· 全球公测预热',
    game: '星轨协议',
    market: '全球',
    budget: '$18,000',
    owner: 'MC',
    health: 'wn',
    cur: 'reach',
    goal: '公测前 30 天内获得 300 万曝光，验证硬核射击向创作者对新用户的拉新效率',
  },
  {
    id: 'lc',
    name: '《料理次元》· 日本区上线',
    game: '料理次元',
    market: '日本',
    budget: '$12,000',
    owner: 'AD',
    health: 'gd',
    cur: 'match',
    goal: '上线首周进入日区模拟经营榜 Top 20，触达女性向生活玩家',
  },
  {
    id: 'aw',
    name: '《暗域拓荒》· Steam 抢先体验',
    game: '暗域拓荒',
    market: 'Steam 全球',
    budget: '$9,000',
    owner: 'KM',
    health: 'gd',
    cur: 'delivery',
    goal: '抢先体验期获得 800 条真实评测，愿望单转化率 8%',
  },
  {
    id: 'mf',
    name: '《萌宠农场》· 北美拉新',
    game: '萌宠农场',
    market: '北美',
    budget: '$7,500',
    owner: 'AD',
    health: 'cr',
    cur: 'insight',
    goal: '通过休闲玩家社群获得 5,000 次有效安装',
  },
];

/**
 * 旧 demo 深链兼容：AGENT-FOUNDATION demo-projects id → 原型 canonical id。
 * starlight-protocol 即《星轨协议》（scripts/test f007/f010 仍以该 id 访问详情页）；
 * 其余旧 id（nebula-drift / iron-vanguard）无原型对应项目，走详情页 D2 优雅降级。
 */
const LEGACY_ID_ALIAS: Record<string, string> = {
  'starlight-protocol': 'xg',
};

export function getMockProject(id: string): MockProject | undefined {
  const canonical = LEGACY_ID_ALIAS[id] ?? id;
  return mockProjects.find((p) => p.id === canonical);
}
