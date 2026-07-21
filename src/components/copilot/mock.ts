// ARCH-M05 mock — F003 三区外壳 Copilot 静态数据（原型 interaction-prototype-v2.html L603/L1023-1082 移植）。
// M0.5 mock 先行（架构 §6.7）：greeting / 刚刚完成 / 建议 chips / 动作卡 / 协同逐轮台词均为静态数据，
// M1+ 由 Agent 运行时（handoff 表 / 待办服务）替换；文案逐字取自原型。

import type { AgentId } from 'lib/agent/registry';
import type { CopilotAction } from './ActionCard';

/** 单条 Copilot 上下文 mock（原型 copContext 返回结构） */
export interface CopilotUiMock {
  /** cop-head 副标题（S3-4） */
  sub: string;
  /** 开场白（context key 变化后新开场，FR-8.7.9） */
  greeting: string;
  /** 「{专家}刚刚完成」卡条目（S3-8 🔒） */
  did: string[];
  /** 建议 chips（S3-17，每上下文 3 条） */
  prompts: string[];
  /** 开场动作卡（S3-16） */
  actions: CopilotAction[];
  /** 是否显示编队紧凑名册（S3-7 🔒，仅编排上下文） */
  squad: boolean;
}

/** 协同交接逐轮台词（S3-11 🔒，每组 3 轮） */
export interface CollabTurnMock {
  from: AgentId;
  text: string;
}

/** 协同卡 mock（原型 COLLAB 条目） */
export interface CollabMock {
  a: AgentId;
  b: AgentId;
  title: string;
  /** 交接物 chip 文案（S3-12 🔒） */
  payload: string;
  /** 绿色结论行（S3-13 🔒） */
  outcome: string;
  turns: CollabTurnMock[];
}

// ARCH-M05 mock — 原型 PROJECTS（L546-557）：动作卡跳转所用演示项目 id → 游戏名。
export const PROJECT_GAME_MOCK: Record<string, string> = {
  xg: '星轨协议',
  lc: '料理次元',
  aw: '暗域拓荒',
  mf: '萌宠农场',
};

// ARCH-M05 mock — 原型 DID（L603）：各环节专家「刚刚完成」。
const STAGE_DID: Record<string, string[]> = {
  brief: ['刷新目标健康度与曝光进度', '标记硬核向创作者开播率偏低'],
  match: ['筛查 3,100 位创作者生成 3 组方案', '标记 4 位数据存疑候选待裁定'],
  reach: ['为 7 位创作者起草邀约/回复', '同步送达、打开与回复信号'],
  delivery: ['核对 5 笔交付条件', '拦下 3 笔未达条件的放款'],
  insight: ['对齐原目标算出 4 项差异', '标出 3 处证据缺口'],
};

// ARCH-M05 mock — 原型 COLLAB（L1023-1060）：各环节协同交接（含逐轮台词/交接物/结论）。
export const COLLAB_MOCK: Record<string, CollabMock[]> = {
  brief: [
    {
      a: 'strategy',
      b: 'match',
      title: '对齐组合覆盖能否达成 300 万曝光目标',
      payload: '组合预估覆盖 268万 · 缺口 32万',
      outcome: '策略 Agent 采纳 → 生成「补 2 位直播位」待办',
      turns: [
        {
          from: 'strategy',
          text: '目标是 30 天 300 万曝光，当前批准组合的预估覆盖够吗？',
        },
        {
          from: 'match',
          text: '均衡组 12 人预估触达 268 万，缺口约 32 万；补 2 位直播首曝位可再补约 40 万。',
        },
        { from: 'strategy', text: '采纳，把补位需求挂给触达 Agent。' },
      ],
    },
  ],
  match: [
    {
      a: 'match',
      b: 'strategy',
      title: '校验组合预算与目标 KPI 对齐',
      payload: '预算上限 $12k · 目标匹配度',
      outcome: '匹配 Agent 采纳 → 均衡组标记「Agent 推荐」',
      turns: [
        {
          from: 'match',
          text: '3 组方案预算 $11k / $11.8k / $14.6k，哪个更贴目标？',
        },
        {
          from: 'strategy',
          text: '目标上限 $12k，头部组超支 $2.6k 需预算例外；均衡组最贴合。',
        },
        { from: 'match', text: '收到，均衡组置顶为推荐。' },
      ],
    },
    {
      a: 'match',
      b: 'compliance',
      title: '预筛候选的历史合规记录',
      payload: '2 位标记存疑 · 其余合规',
      outcome: '匹配 Agent 采纳 → 2 位移入「待你裁定」',
      turns: [
        { from: 'match', text: '候选里有几位历史存疑，帮我先过一遍合规。' },
        {
          from: 'compliance',
          text: 'ChefRen 有 1 次延迟交付，和风料理粉丝真实性置信度偏低；其余无风险。',
        },
        { from: 'match', text: '把这两位移入待裁定，不进自动组合。' },
      ],
    },
  ],
  reach: [
    {
      a: 'reach',
      b: 'match',
      title: '引用 PixelHana 受众匹配(88%)辅助议价',
      payload: '受众匹配 88% · 真实性 A · 转化中位 4.1%',
      outcome: '触达 Agent 采纳 → 议价 $3,400（草稿已更新）',
      turns: [
        {
          from: 'reach',
          text: 'PixelHana 想把报价从 $3,200 提到 $3,600，我需要她的受众质量来判断值不值。',
        },
        {
          from: 'match',
          text: '硬核射击向受众占比 88%，真实性 A 级，历史转化中位 4.1%——高于本项目均值。',
        },
        {
          from: 'reach',
          text: '那我按 $3,400 议价并加一次社区置顶，性价比仍在预算内。',
        },
      ],
    },
    {
      a: 'reach',
      b: 'compliance',
      title: '邀约中的授权范围已过合规复核',
      payload: '授权表述 ✓ · 提示补二创授权边界',
      outcome: '合规通过 → 草稿补充二创授权条款',
      turns: [
        {
          from: 'reach',
          text: '邀约写「北美区社媒 · 6 个月」授权，请复核是否合规。',
        },
        {
          from: 'compliance',
          text: '表述合规；提醒：需在合同注明二次剪辑授权边界，否则默认不含。',
        },
        { from: 'reach', text: '已在草稿补一句「含一次高光二创授权」。' },
      ],
    },
  ],
  delivery: [
    {
      a: 'delivery',
      b: 'compliance',
      title: 'ArkPlays 缺 #ad 披露 —— 合规 Agent 已拦截放款',
      payload: '#ad 披露缺失 · 不满足放款条件',
      outcome: '交付 Agent 拦截 → 放款暂停，退回补披露',
      turns: [
        {
          from: 'delivery',
          text: 'ArkPlays 交付已收，准备放款 $1,200，请做合规终检。',
        },
        {
          from: 'compliance',
          text: '终稿未见 #ad 披露标识，按平台与本地法规不合规，放款条件不满足。',
        },
        { from: 'delivery', text: '已拦截放款，退回 ArkPlays 补披露后再核。' },
      ],
    },
    {
      a: 'delivery',
      b: 'reach',
      title: '向触达 Agent 索取 MeepleMax 报价与交付约定',
      payload: '报价 $1,600 · 交付约定一致',
      outcome: '交付 Agent 核对通过 → MeepleMax 可放款',
      turns: [
        {
          from: 'delivery',
          text: '放款前要核对 MeepleMax 的报价与交付约定，最终条款是？',
        },
        {
          from: 'reach',
          text: '$1,600，含抢先体验实况 1 场 + 高光二创授权，已双方确认。',
        },
        { from: 'delivery', text: '与合同一致，条件齐备，可放款。' },
      ],
    },
  ],
  insight: [
    {
      a: 'insight',
      b: 'strategy',
      title: '把复盘结论回填到下一个 Brief 的默认组合',
      payload: '休闲农场向 = 最高 ROI 组合',
      outcome: '策略 Agent 采纳 → 回填下个 Brief 默认组合',
      turns: [
        {
          from: 'insight',
          text: '复盘显示休闲农场向创作者 ROI 最高，建议设为默认组合。',
        },
        {
          from: 'strategy',
          text: '收到，写进下个项目 Brief 的默认组合模板与预算配比。',
        },
        {
          from: 'insight',
          text: '同步证据缺口（北美安卓归因）作为下次埋点前置项。',
        },
      ],
    },
  ],
};

/** 按交接对（无序）查协同 mock —— 用于给 /api/handoffs 真实行补逐轮台词。 */
export function findCollabMockByPair(
  from: string,
  to: string,
): CollabMock | null {
  for (const entries of Object.values(COLLAB_MOCK)) {
    for (const e of entries) {
      if ((e.a === from && e.b === to) || (e.a === to && e.b === from)) {
        return e;
      }
    }
  }
  return null;
}

// —— 以下为原型 copContext（L1062-1082）各上下文 mock ——

/** 编排 Agent 默认上下文（today / 项目列表 / 未指定环节的项目详情） */
const ORCHESTRATOR_UI: CopilotUiMock = {
  sub: '协调 5 位环节专家',
  greeting:
    '我是编排 Agent，负责在环节间调度专家 Agent。今天有 3 个动作在等你，要我带你去哪个？',
  did: ['编排 5 位专家 Agent 的夜间任务', '把 3 个待确认动作汇总到你面前'],
  prompts: ['谁在等我回复', '各 Agent 在忙什么', '汇总今天进展'],
  actions: [
    {
      icon: 'mail',
      title: '审阅并发送 12 封邀约',
      sub: '星轨协议 · 触达 Agent',
      go: 'enter:xg:reach',
    },
    {
      icon: 'users',
      title: '批准一组创作者组合',
      sub: '料理次元 · 匹配 Agent',
      go: 'enter:lc:match',
    },
    {
      icon: 'ledger',
      title: '放款 $1,600 给 MeepleMax',
      sub: '暗域拓荒 · 交付 Agent',
      go: 'enter:aw:delivery',
    },
  ],
  squad: true,
};

const ROUTE_UI: Record<string, CopilotUiMock> = {
  insight: {
    sub: 'Insight · 跨项目 ROI',
    greeting:
      '我是洞察 Agent。本季综合 ROI 3.8x，料理次元最高(4.6x)、萌宠农场偏低(2.1x)。要我拆解萌宠农场吗？',
    did: ['汇总 4 个项目的 ROI 与转化', '起草本周周报草案'],
    prompts: ['为什么萌宠农场 ROI 低', '生成本周周报', '哪个项目该加投'],
    actions: [],
    squad: false,
  },
  runs: {
    sub: '全编队留痕',
    greeting:
      '我是编排 Agent。这里是全编队的动作留痕——自动完成、需你确认、已拦截、不可逆都可查。要按类型筛选吗？',
    did: ['记录 24 项自动动作', '标注 3 项不可逆动作留痕'],
    prompts: ['只看不可逆动作', '谁拦截了什么', '今天自动做了多少'],
    actions: [],
    squad: false,
  },
  creators: {
    sub: 'Match · 跨项目发现',
    greeting:
      '我是匹配 Agent。库里 248 位创作者已按你在跑的项目品类排序。要我把高匹配的加入某个项目吗？',
    did: ['按你的项目品类预排序 248 位创作者', '标记 54 位高复用价值创作者'],
    prompts: ['找射击向创作者', '谁复用价值最高', '加入料理次元匹配'],
    actions: [],
    squad: false,
  },
  knowledge: {
    sub: 'Strategy · 知识底座',
    greeting:
      '我是策略 Agent。这个知识库由你上传的素材构成——我解析素材、提炼游戏特点，再喂给匹配、触达、合规各环节。上传新素材后我会自动重新分析。要看哪个游戏？',
    did: ['解析你上传的 12 份游戏素材', '从素材提炼卖点 / 受众 / 合规红线'],
    prompts: ['这个游戏还缺哪类素材', '刚上传的素材解析出什么', '对比两个游戏受众'],
    actions: [],
    squad: false,
  },
};

/** 各环节专家上下文（项目详情 + ?stage=） */
function stageUi(stage: string, game: string): CopilotUiMock | null {
  switch (stage) {
    case 'brief':
      return {
        sub: 'Strategy · 本环节专家',
        greeting: `我是策略 Agent。「${game}」目标完成 64%，有 1 处阻塞：硬核向创作者开播率偏低。要我补 2 位直播首曝位吗？`,
        did: STAGE_DID.brief,
        prompts: ['补 2 位直播位', '这个阻塞严重吗', '和匹配 Agent 对一下组合'],
        actions: [
          {
            icon: 'target',
            title: '查看目标健康度',
            sub: '192万 / 300万 曝光',
            go: 'env:brief',
          },
        ],
        squad: false,
      };
    case 'match':
      return {
        sub: 'Match · 本环节专家',
        greeting:
          '我是匹配 Agent。筛了 3,100 位创作者给出 3 组方案，「均衡组」受众匹配最高。要我解释推荐依据吗？',
        did: STAGE_DID.match,
        prompts: ['为什么推荐均衡组', '有哪些存疑候选', '请合规 Agent 预筛候选'],
        actions: [
          {
            icon: 'users',
            title: '查看 B · 均衡组',
            sub: '匹配 Agent 推荐 · 匹配 74%',
            go: 'env:match',
          },
        ],
        squad: false,
      };
    case 'reach':
      return {
        sub: 'Outreach · 本环节专家',
        greeting: `我是触达 Agent。已为「${game}」起草 7 封邀约，12 封待你审阅发送。先带你看哪一位？`,
        did: STAGE_DID.reach,
        prompts: ['谁在等我回复', '把草稿写得更简短', '让合规 Agent 复核授权范围'],
        actions: [
          {
            icon: 'mail',
            title: 'PixelHana',
            sub: '谈判中 · 匹配 88%',
            go: 'pick:pix',
          },
          {
            icon: 'mail',
            title: 'GG龙',
            sub: '已确认 · 匹配 82%',
            go: 'pick:ggl',
          },
          {
            icon: 'mail',
            title: 'NovaMei',
            sub: '已回复 · 匹配 76%',
            go: 'pick:nm',
          },
        ],
        squad: false,
      };
    case 'delivery':
      return {
        sub: 'Delivery · 本环节专家',
        greeting:
          '我是交付 Agent。5 笔交付里 2 笔条件已齐可放款，3 笔缺条件我已拦下。要逐笔说明缺什么吗？',
        did: STAGE_DID.delivery,
        prompts: ['为什么 ArkPlays 不能放款', '汇总缺失条件', '向触达 Agent 要报价约定'],
        actions: [
          {
            icon: 'ledger',
            title: '查看待放款',
            sub: '2 笔条件已齐',
            go: 'env:delivery',
          },
        ],
        squad: false,
      };
    case 'insight':
      return {
        sub: 'Insight · 本环节专家',
        greeting:
          '我是洞察 Agent。达成原目标 3/4 项，7 日留存偏低。我起草了复盘草案，一起看吗？',
        did: STAGE_DID.insight,
        prompts: ['为什么留存偏低', '哪些能复用', '回填到下个 Brief'],
        actions: [
          {
            icon: 'chart',
            title: '查看复盘草案',
            sub: '含 3 处证据缺口',
            go: 'env:insight',
          },
        ],
        squad: false,
      };
    default:
      return null;
  }
}

/**
 * 按 copilot 上下文取 mock UI（原型 copContext 移植）。
 * 项目详情（projectId + 有效 stage）→ 环节专家；否则按 route 末段；兜底编排 Agent。
 */
export function mockCopilotUi(
  route: string,
  stage: string | null,
  projectId: string | null,
): CopilotUiMock {
  if (projectId && stage) {
    const game = PROJECT_GAME_MOCK[projectId] ?? '当前项目';
    const ui = stageUi(stage, game);
    if (ui) return ui;
  }
  const seg = route.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  return ROUTE_UI[seg] ?? ORCHESTRATOR_UI;
}
