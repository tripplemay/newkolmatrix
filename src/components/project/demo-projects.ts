// AGENT-FOUNDATION F008 — 项目 IA 演示数据（静态占位）
//
// F008 是 IA 结构地基：侧栏 6 项 + 项目空间是五环节唯一容器。项目领域内容（真实 Campaign 数据、
// 五环节业务）→ M1-M4。此处用静态 demo 项目让 IA 可导航（项目列表 → 项目详情五环节）。
// EXTENSION POINT：换成 F002 Project 表 + 真实环节状态。

export interface DemoProject {
  id: string;
  name: string;
  owner: string; // D29 分工标记
  cover: string; // 品类
  progress: string; // 当前所处环节文案
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'starlight-protocol',
    name: '《星轨协议》全球上线',
    owner: 'Leo',
    cover: 'FPS / 策略',
    progress: 'Reach 环节 · 12 封邀约待你确认',
  },
  {
    id: 'nebula-drift',
    name: '《星云漂流》创作者联动',
    owner: 'Ada',
    cover: '开放世界',
    progress: 'Match 环节 · 组合态待复核',
  },
  {
    id: 'iron-vanguard',
    name: '《钢铁先锋》赛事季',
    owner: 'Kai',
    cover: '竞技 / MOBA',
    progress: 'Insight 环节 · ROI 归因中',
  },
];

export function getDemoProject(id: string): DemoProject | undefined {
  return DEMO_PROJECTS.find((p) => p.id === id);
}
