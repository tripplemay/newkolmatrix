// ARCH-M05 F010 — Reach 环节 mock（V6 对话收件箱数据源；原型
// interaction-prototype-v2.html CREATORS L560-576 逐字转录，7 人含 thread/draft/档案）。
//
// D2 渲染契约（mock/index.ts 硬规则）：
// - 深字段 thread 一律 unknown，页面经 lib/data/provenance readContractSlot 读取
//   （脏数据降级 null → 空态渲染，绝不抛错）；mm / krv 两人 thread=[] 即 V6 🔒 空态展示位。
// - match（受众匹配度 %）nullable：null = 「待核」（裁决 #2），绝不填 0 冒充实测。
// - 溯源契约位（dataSource/fieldProvenance）归 creators.ts（F013/V10）——V6 权威清单
//   24 元素无 ProvenanceTag 消费位，本文件不投机预置。
// - URL 化状态位是路由状态，不入 mock（裁决 #4）。

import { z } from 'zod';

/** 谈判阶段五态（原型 stage，V6 🔒 五态阶段 pill——不得压缩合并） */
export type ReachStage = '待发送' | '已发送' | '已回复' | '谈判中' | '已确认';

/** pill 色调四族（原型 .pill gd/wn/ac/nu） */
export type ReachStageTone = 'gd' | 'wn' | 'ac' | 'nu';

/**
 * 阶段 → pill 色调（原型 7 行 per-row tone 与该映射逐一一致，收敛为单一出处，
 * 使 mock 流 stage 变更（发送 → 已发送）后 pill 色调机械跟随）。
 */
export const REACH_STAGE_TONE: Record<ReachStage, ReachStageTone> = {
  待发送: 'nu',
  已发送: 'nu',
  已回复: 'ac',
  谈判中: 'wn',
  已确认: 'gd',
};

/** 对话消息 schema（thread 深字段经 readContractSlot 消费；脏数据降级 null 不抛错）。
 * in=来信 白左尖角 / out=我方 渐变紫右尖角。 */
export const reachMessageSchema = z.object({
  who: z.enum(['in', 'out']),
  t: z.string(),
  at: z.string(),
});
export type ReachMessage = z.infer<typeof reachMessageSchema>;

/** thread 深字段 schema（[] = 还没有往来 → V6 🔒 空态句） */
export const reachThreadSchema = z.array(reachMessageSchema);

export interface ReachCreator {
  id: string;
  name: string;
  /** '平台 · 粉丝量'（右栏档案 平台/粉丝量 两行由此拆分，原型 plat.split(' · ')） */
  plat: string;
  stage: ReachStage;
  /** 受众匹配度 %；null = 待核（裁决 #2），右栏 ring 84 读数 */
  match: number | null;
  past: string;
  /** 左栏 ibrow last 预览行 */
  last: string;
  /** 深字段：ReachMessage[]，经 readContractSlot(reachThreadSchema) 读取 */
  thread: unknown;
  /** Agent 起草的邀约草稿（可编辑后发送 = internal） */
  draft: string;
}

// 原型 CREATORS（L560-576）：文案逐字，顺序即 avatar 色轮序。
export const mockReachCreators: ReachCreator[] = [
  {
    id: 'pix',
    name: 'PixelHana',
    plat: 'YouTube · 61万',
    stage: '谈判中',
    match: 88,
    past: '2 次合作',
    last: '独家档期能不能提前两周？',
    thread: [
      {
        who: 'in',
        t: '嗨，看到《星轨协议》公测企划，射击手感看起来不错。',
        at: '周一 10:20',
      },
      {
        who: 'out',
        t: '谢谢关注！想邀请你做一支 10 分钟公测首曝实机，$3,200，含北美区社媒二次授权。',
        at: '周一 15:10',
      },
      {
        who: 'in',
        t: '独家档期能不能提前两周？另外报价能到 $3,600 吗？',
        at: '周二 09:05',
      },
    ],
    draft:
      'PixelHana 你好，公测解锁日无法提前，但可给你 48 小时媒体抢先码优先出片。报价我们到 $3,400，含一次社区置顶转发，你看是否可行？',
  },
  {
    id: 'ggl',
    name: 'GG龙',
    plat: 'TikTok · 120万',
    stage: '已确认',
    match: 82,
    past: '首次',
    last: 'OK，按 $2,600 走，脚本发我。',
    thread: [
      {
        who: 'out',
        t: '邀请你做一条《星轨协议》公测高光短视频，$2,600。',
        at: '周一 16:40',
      },
      { who: 'in', t: 'OK，按 $2,600 走，脚本发我。', at: '周一 20:12' },
    ],
    draft:
      'GG龙 你好，合同稍后发你签署，脚本方向周四前给到初稿，重点突出双武器切换。',
  },
  {
    id: 'nm',
    name: 'NovaMei',
    plat: 'Instagram · 38万',
    stage: '已回复',
    match: 76,
    past: '首次',
    last: '有兴趣，能给详细 brief 吗？',
    thread: [
      {
        who: 'out',
        t: '想邀请你做一组角色视觉图文，$1,800。',
        at: '周二 11:30',
      },
      { who: 'in', t: '有兴趣，能给详细 brief 吗？', at: '周二 14:02' },
    ],
    draft:
      'NovaMei 你好，brief 已附上：3 张角色主题图 + 1 条 Reels，交付周期 10 天，$1,800 含平台二次授权。',
  },
  {
    id: 'yn',
    name: '유나Play',
    plat: 'YouTube · 47만',
    stage: '已发送',
    match: 79,
    past: '1 次合作',
    last: '—— 等待回复',
    thread: [
      {
        who: 'out',
        t: '邀请你参与《星轨协议》公测韩区首曝，$2,400。',
        at: '今天 09:30',
      },
    ],
    draft:
      '유나Play 你好，补充一下：本周内确认可进入首发批次，并获得韩区独家实机时段。',
  },
  {
    id: 'mm',
    name: 'MeepleMax',
    plat: 'Twitch · 29万',
    stage: '待发送',
    match: 71,
    past: '首次',
    last: '—— Agent 已起草邀约',
    thread: [],
    draft:
      'MeepleMax 你好，我们正在筹备《星轨协议》公测，想邀请你做一场 2 小时首曝直播联动，$2,200，含高光剪辑二次授权。有兴趣吗？',
  },
  {
    id: 'krv',
    name: 'KaiReviews',
    plat: 'YouTube · 55万',
    stage: '待发送',
    match: 74,
    past: '首次',
    last: '—— Agent 已起草邀约',
    thread: [],
    draft:
      'KaiReviews 你好，想邀请你做一支《星轨协议》公测评测，$2,800，含深度玩法解析。',
  },
  {
    id: 'lila',
    name: 'Lila Streams',
    plat: 'Twitch · 33万',
    stage: '已回复',
    match: 80,
    past: '2 次合作',
    last: '档期在公测周可以，聊聊细节。',
    thread: [
      {
        who: 'out',
        t: '邀请你公测周做 3 场直播联动，$2,500。',
        at: '周一 13:00',
      },
      { who: 'in', t: '档期在公测周可以，聊聊细节。', at: '周一 17:20' },
    ],
    draft:
      'Lila 你好，3 场直播我们希望覆盖公测首日/周中/周末，每场 90 分钟，$2,500 打包，含高光二创授权。',
  },
];

/** 右栏「Agent 建议」段（原型 L794 静态文案，逐字；选中人切换不变，与原型行为一致） */
export const REACH_AGENT_ADVICE =
  '该创作者硬核向受众占比高，建议强调实机手感与独家档期。';

/**
 * 🚪 commit_quote 确认卡 harm 3 行 mock（原型 L1000 逐字：金额/交付内容/授权范围，裁决 #3
 * 「如实披露」行随动作不同）。真 Quote 实体与工具实装归 M3（architecture §9.5）。
 */
export const REACH_QUOTE = {
  amount: '$3,400',
  deliverable: '1 支公测首曝实机',
  scope: '北美区社媒 · 6 个月',
} as const;
