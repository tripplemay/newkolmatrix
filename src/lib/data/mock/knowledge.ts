// ARCH-M05 F014 — 游戏知识页 mock（V11，原型 GAMEKB L615-643 逐字转录）。
//
// 契约（src/lib/data/mock/index.ts 硬规则）：
// - 实体携带 { dataSource, fieldProvenance } 溯源契约位（§7.5）：行级 = user_upload
//   （素材由你上传构成），字段级 'analysis' = ai_estimate（策略 Agent 解析产物）——
//   kb-prov 溯源行经 resolveProvenance(game, 'analysis') → ProvenanceTag inline 渲染，
//   label 覆盖为原型 from 文案（裁决 #10）。
// - `id` 是 kbGame URL 化槽位（?game=，裁决 #4 / D7）：路由状态不入 mock，
//   mock 只提供合法值域。
// - color 为游戏主题色（kb-dot / kb-ic / 目标受众 Progress 用，数据驱动 inline style，
//   沿 AgentSquad AGENT_THEME 先例）。

import type { DataSource, FieldProvenance } from 'lib/data/provenance';

export type MaterialType = 'doc' | 'video' | 'data' | 'image';

/** 状态二态（V11 🔒）：done 绿「AI 已解析」/ analyzing 琥珀「解析中…」——异步中间态不得省 */
export type MaterialStatus = 'done' | 'analyzing';

export interface KnowledgeMaterial {
  name: string;
  type: MaterialType;
  /** 来源（官方 / 第三方 / 投放后台 / 你上传） */
  src: string;
  status: MaterialStatus;
  date: string;
}

export interface AudienceSlice {
  label: string;
  percent: number;
}

export interface GameKnowledgeEntry {
  /** kbGame URL 化槽位（?game=） */
  id: string;
  game: string;
  genre: string;
  market: string;
  /** 游戏主题色（原型 GAMEKB.color） */
  color: string;
  materials: KnowledgeMaterial[];
  /** kb-prov 溯源行文案（逐字原型；作 ProvenanceTag inline 的 label 覆盖位） */
  from: string;
  sell: string[];
  aud: AudienceSlice[];
  rules: string[];
  /** kb-use 跨 Agent 消费链宣示（逐字原型） */
  use: string;
  dataSource: DataSource;
  fieldProvenance: Record<string, FieldProvenance>;
}

/** 'analysis' 字段级溯源：策略 Agent 解析产物 = ai_estimate 档（保守下限，§7.5） */
const analysisProvenance = (detail: string): Record<string, FieldProvenance> => ({
  analysis: {
    source: 'ai_estimate',
    fetchedAt: null,
    confidence: null,
    detail,
  },
});

export const mockGameKnowledge: GameKnowledgeEntry[] = [
  {
    id: 'star-protocol',
    game: '星轨协议',
    genre: '硬核射击',
    market: '全球',
    color: '#422afb',
    materials: [
      { name: '星轨协议·设定集 v2.pdf', type: 'doc', src: '官方', status: 'done', date: '3 天前' },
      { name: '公测实机预告.mp4', type: 'video', src: '官方', status: 'done', date: '3 天前' },
      { name: '首曝媒体评测合集.pdf', type: 'doc', src: '第三方', status: 'done', date: '2 天前' },
      { name: '玩家画像数据.csv', type: 'data', src: '投放后台', status: 'done', date: '1 天前' },
    ],
    from: '策略 Agent 基于 4 份素材分析（设定集 · 实机预告 · 媒体评测 · 玩家数据）',
    sell: ['双武器实时切换手感', '公测 48h 媒体抢先码', '硬核 PVP 天梯赛'],
    aud: [
      { label: '硬核射击玩家', percent: 58 },
      { label: '竞技向', percent: 24 },
      { label: '泛动作观众', percent: 18 },
    ],
    rules: ['必须标注 #ad / 广告合作', '实机须为真实公测版本', '暴力分级：北美 T for Teen'],
    use: '匹配 Agent 用受众做匹配 · 触达 Agent 用卖点起草 · 合规 Agent 用红线拦截',
    dataSource: 'user_upload',
    fieldProvenance: analysisProvenance('策略 Agent 基于 4 份上传素材解析提炼；素材级来源见素材库列表'),
  },
  {
    id: 'cuisine-dimension',
    game: '料理次元',
    genre: '模拟经营',
    market: '日本',
    color: '#01b574',
    materials: [
      { name: '料理次元·世界观设定.pdf', type: 'doc', src: '官方', status: 'done', date: '5 天前' },
      { name: '角色与料理美术集.zip', type: 'image', src: '官方', status: 'done', date: '5 天前' },
      { name: '日区问卷调研.csv', type: 'data', src: '第三方', status: 'done', date: '3 天前' },
    ],
    from: '策略 Agent 基于 3 份素材分析（世界观设定 · 美术集 · 日区调研）',
    sell: ['角色养成 + 料理收集', '日式细腻美术风格', '轻松单手可玩'],
    aud: [
      { label: '女性向生活玩家', percent: 54 },
      { label: '模拟经营', percent: 30 },
      { label: '二次元', percent: 16 },
    ],
    rules: ['#ad 披露', '日区素材需日语本地化', '禁止夸大付费收益'],
    use: '匹配 Agent 优先女性向生活受众 · 触达 Agent 强调养成与美术 · 合规 Agent 校验本地化',
    dataSource: 'user_upload',
    fieldProvenance: analysisProvenance('策略 Agent 基于 3 份上传素材解析提炼；素材级来源见素材库列表'),
  },
  {
    id: 'dark-frontier',
    game: '暗域拓荒',
    genre: '生存建造',
    market: 'Steam 全球',
    color: '#3965ff',
    materials: [
      { name: '暗域拓荒·玩法白皮书.pdf', type: 'doc', src: '官方', status: 'done', date: '6 天前' },
      { name: '抢先体验版实录.mp4', type: 'video', src: '官方', status: 'done', date: '4 天前' },
      { name: 'Steam 评测抓取.csv', type: 'data', src: '第三方', status: 'done', date: '2 天前' },
    ],
    from: '策略 Agent 基于 3 份素材分析（玩法白皮书 · 实录 · Steam 评测）',
    sell: ['开放世界生存', '深度建造系统', '抢先体验持续更新'],
    aud: [
      { label: '生存建造', percent: 47 },
      { label: '硬核探索', percent: 33 },
      { label: '教程向观众', percent: 20 },
    ],
    rules: ['#ad 披露', '需说明抢先体验状态', '评测须标注是否受赞助'],
    use: '匹配 Agent 找建造/教程创作者 · 触达 Agent 突出更新节奏 · 合规 Agent 核抢先体验声明',
    dataSource: 'user_upload',
    fieldProvenance: analysisProvenance('策略 Agent 基于 3 份上传素材解析提炼；素材级来源见素材库列表'),
  },
  {
    id: 'pet-farm',
    game: '萌宠农场',
    genre: '休闲',
    market: '北美',
    color: '#e89a1c',
    materials: [
      { name: '萌宠农场·美术风格指南.pdf', type: 'doc', src: '官方', status: 'done', date: '4 天前' },
      { name: '北美用户留存数据.csv', type: 'data', src: '投放后台', status: 'done', date: '2 天前' },
    ],
    from: '策略 Agent 基于 2 份素材分析（风格指南 · 留存数据）',
    sell: ['萌系农场经营', '社交好友互助', '碎片时间可玩'],
    aud: [
      { label: '休闲农场向', percent: 44 },
      { label: '生活方式', percent: 27 },
      { label: '亲子家庭', percent: 29 },
    ],
    rules: ['#ad 披露', '家庭向需 E 分级素材', '儿童隐私合规(COPPA)'],
    use: '匹配 Agent 优先亲子/休闲 · 触达 Agent 强调碎片可玩 · 合规 Agent 校验儿童合规',
    dataSource: 'user_upload',
    fieldProvenance: analysisProvenance('策略 Agent 基于 2 份上传素材解析提炼；素材级来源见素材库列表'),
  },
];

/** ?game= 值域校验：非法 / 缺失 → 首个游戏（D2 语义：绝不抛错） */
export function findGameKnowledge(id: string | undefined): GameKnowledgeEntry {
  return mockGameKnowledge.find((g) => g.id === id) ?? mockGameKnowledge[0];
}

/* ------------------------------------------------------------------ *
 * 上传 mock 时序（原型 L993 逐字转录；真实解析管道归 M1 knowledge 域）
 * ------------------------------------------------------------------ */

/** 原型上传循环素材名/类型（idx = 现有素材数 % 4） */
export const UPLOAD_CYCLE: ReadonlyArray<{ name: string; type: MaterialType }> = [
  { name: '玩法深度解析.pdf', type: 'doc' },
  { name: '角色设定原画.zip', type: 'image' },
  { name: 'KOL 历史投放数据.csv', type: 'data' },
  { name: '社区高热讨论合集.pdf', type: 'doc' },
];

/** analyzing → done 的 mock 解析时长（原型 setTimeout 1100） */
export const MOCK_ANALYZE_MS = 1100;

/** 「重新分析」双段 Toast 的间隔（原型 setTimeout 1000） */
export const MOCK_REANALYZE_MS = 1000;

/** 按原型规则合成一条新上传素材（analyzing 中间态；名称按现有素材数循环取） */
export function nextUploadMaterial(existingCount: number): KnowledgeMaterial {
  const cycle = UPLOAD_CYCLE[existingCount % UPLOAD_CYCLE.length];
  return {
    name: cycle.name,
    type: cycle.type,
    src: '你上传',
    status: 'analyzing',
    date: '刚刚',
  };
}
