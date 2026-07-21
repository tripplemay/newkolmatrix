'use client';
// ARCH-M05 F010 — Reach 三栏对话收件箱（V6 权威清单 24 元素，converse 语法）。
// 对照原型 `.inbox`（L784-796）：左人列（搜索 + ibrow ×7）/ 中对话+草稿 / 右档案，
// 280 / minmax(0,1fr) / 240，min-h 540；整个环节聚焦一个人（FR-7.10 与 Match 横向对比刻意相反）。
//
// 🚪 闸门接线（spec D6 / architecture §9.5 M0.5 边界，显式 stub 标注）：
// 本面只做「触发点 + GateConfirm 确认卡 UI」。确认后为 mock 流（Toast + 本地 stage 变更），
// 真 send_outreach / commit_quote 的 pending → /api/gate/{confirm,reject} 服务端链路
// 与工具实装归 M3——接线时以 confirmSend / confirmQuote 两处 stub 为唯一替换点。
//
// internal / outbound 边界（§9）：改草稿 = internal（textarea 直接编辑，无弹窗）；
// 发送 / 报价 = outbound（红 gate 钮 → GateConfirm，harm 行随动作 2/3 行，裁决 #3）。

import React from 'react';
import {
  MdAttachMoney,
  MdAutoAwesome,
  MdOutlineEdit,
  MdOutlineShield,
  MdSearch,
  MdSend,
} from 'react-icons/md';
import CircularProgress from 'components/charts/CircularProgress';
import Button from 'components/common/Button';
import GateConfirm from 'components/common/GateConfirm';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
// F007 既有件复用（只读，不改动）：原型 avatar() 色轮同规格
import ProjectAvatar from 'components/project/ProjectAvatar';
import {
  mockReachCreators,
  reachThreadSchema,
  REACH_AGENT_ADVICE,
  REACH_QUOTE,
  REACH_STAGE_TONE,
  type ReachStage,
  type ReachStageTone,
} from 'lib/data/mock/env-reach';
import { readContractSlot } from 'lib/data/provenance';

/** 原型 .pill 四色调（与 campaigns 页 Pill 同规格；ac=brand 淡紫族） */
const PILL_TONE: Record<ReachStageTone, string> = {
  gd: 'bg-green-50 text-green-600',
  wn: 'bg-orange-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
  ac: 'bg-brand-50 text-brand-500 dark:bg-brand-400/10 dark:text-white',
  nu: 'bg-lightPrimary text-gray-600 dark:bg-navy-700 dark:text-gray-400',
};

/** V6-左3 🔒 五态阶段 pill（原型 ibrow 内 padding 2px 8px / font 10px 缩格） */
function StagePill({ stage }: { stage: ReachStage }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-mini font-bold ${
        PILL_TONE[REACH_STAGE_TONE[stage]]
      }`}
    >
      {stage}
    </span>
  );
}

/** 右栏 ctx-block 小节标题（原型 .cb-h） */
function CtxHeading({
  center = false,
  children,
}: {
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-[9px] text-micro font-bold uppercase tracking-wide text-gray-400 ${
        center ? 'text-center' : ''
      }`}
    >
      {children}
    </div>
  );
}

/** 右栏档案 kv 行（原型 .ctx-stat） */
function CtxStat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[5px] text-[12.5px] text-gray-600 dark:text-gray-400">
      <span>{k}</span>
      <b className="text-right text-navy-700 dark:text-white">{v}</b>
    </div>
  );
}

export default function ConversationInbox({
  projectId,
}: {
  projectId: string;
}) {
  const toast = useToast();
  const [selectedId, setSelectedId] = React.useState(mockReachCreators[0].id);
  /** mock 流 stage 覆盖（发送确认 → 已发送）；immutable spread，不改 mock 源 */
  const [stageOverride, setStageOverride] = React.useState<
    Record<string, ReachStage>
  >({});
  /** 草稿编辑 = internal（可编辑后发送），按人暂存 */
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [gate, setGate] = React.useState<'send' | 'quote' | null>(null);

  const selected =
    mockReachCreators.find((c) => c.id === selectedId) ?? mockReachCreators[0];
  const selectedIndex = mockReachCreators.indexOf(selected);
  const stageOf = (id: string, fallback: ReachStage): ReachStage =>
    stageOverride[id] ?? fallback;
  const selectedStage = stageOf(selected.id, selected.stage);
  /** 档案 平台/粉丝量 两行由 plat 拆分（原型 plat.split(' · ')） */
  const [platName, platFollowers] = selected.plat.split(' · ');
  /** thread 深字段经契约层读取：脏数据/缺失 → null → 空态（D2 绝不抛错） */
  const thread =
    readContractSlot(
      reachThreadSchema,
      selected.thread,
      `env-reach.${selected.id}.thread`,
    ) ?? [];
  const draftValue = drafts[selected.id] ?? selected.draft;

  const closeGate = () => setGate(null);

  /** 🚪 send_outreach mock 流（D6 stub）：真 pending→confirm 链路接线归 M3，此处为唯一替换点 */
  const confirmSend = () => {
    setStageOverride((prev) => ({ ...prev, [selected.id]: '已发送' }));
    setGate(null);
    toast('邀约已发送（mock）');
  };

  /** 🚪 commit_quote mock 流（D6 stub）：真 Quote 工具实装归 M3，此处为唯一替换点 */
  const confirmQuote = () => {
    setGate(null);
    toast(`已向 ${selected.name} 确认 ${REACH_QUOTE.amount} 报价`);
  };

  return (
    <div data-project={projectId}>
      {/* V6-1 三栏收件箱（原型 .inbox 280/minmax(0,1fr)/240 min-h 540；<xl 收 ctx，<md 单列） */}
      <SurfaceCard className="grid min-h-[540px] grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_240px]">
        {/* ── 左栏人列（原型 .ib-list） ── */}
        <div className="flex min-w-0 flex-col border-b border-gray-100 dark:border-white/10 md:border-b-0 md:border-r">
          {/* V6-2 搜索框（原型 .ib-search，行为与原型一致：仅呈现，不带过滤逻辑） */}
          <div className="p-4">
            <div className="flex items-center gap-2 rounded-[14px] bg-lightPrimary px-3.5 py-2.5 text-gray-400 dark:bg-navy-800">
              <MdSearch className="h-4 w-4 shrink-0" aria-hidden />
              <input
                placeholder="搜索创作者…"
                aria-label="搜索"
                className="w-full bg-transparent text-compact text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />
            </div>
          </div>
          {/* V6-3..7 ibrow ×7：avatar / 名 / 🔒 五态阶段 pill / last 预览 / on 淡紫 */}
          <div className="flex-1 overflow-y-auto max-md:max-h-[220px]">
            {mockReachCreators.map((c, i) => {
              const on = c.id === selected.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-[11px] border-t border-gray-100 px-4 py-3.5 text-left dark:border-white/10 ${
                    on
                      ? 'bg-brand-50 dark:bg-brand-400/10'
                      : 'hover:bg-lightPrimary dark:hover:bg-navy-800'
                  }`}
                >
                  <ProjectAvatar label={c.name} index={i} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[7px]">
                      <b className="truncate text-[13.5px] text-navy-700 dark:text-white">
                        {c.name}
                      </b>
                      <span className="ml-auto shrink-0">
                        <StagePill stage={stageOf(c.id, c.stage)} />
                      </span>
                    </div>
                    <p className="mt-[3px] truncate text-[11.5px] text-gray-600 dark:text-gray-400">
                      {c.last}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 中栏对话（原型 .ib-thread） ── */}
        <div className="flex min-w-0 flex-col">
          {/* V6-8..10 th-head：avatar / 名+sub / 🔒🚪 「确认报价」仅 stage==='谈判中' 条件渲染（裁决 #6，7 人仅 PixelHana 命中） */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/10">
            <ProjectAvatar
              label={selected.name}
              index={selectedIndex}
              size={40}
            />
            <div className="min-w-0">
              <b className="block truncate text-[15px] text-navy-700 dark:text-white">
                {selected.name}
              </b>
              <div className="truncate text-[11.5px] text-gray-600 dark:text-gray-400">
                {selected.plat} · {selectedStage}
              </div>
            </div>
            <span className="flex-1" />
            {selectedStage === '谈判中' && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<MdAttachMoney className="h-4 w-4" aria-hidden />}
                onClick={() => setGate('quote')}
              >
                确认报价
              </Button>
            )}
          </div>

          {/* V6-11..14 th-msgs 对话区：msg in 白左尖角 / out 渐变紫右尖角 / 时间戳 .mt / 🔒 空态句 */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-lightPrimary p-5 dark:bg-navy-800">
            {thread.length > 0 ? (
              thread.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[82%] rounded-2xl px-[15px] py-3 text-compact leading-normal ${
                    m.who === 'out'
                      ? 'self-end rounded-br-[5px] bg-gradient-to-br from-brand-400 to-brand-500 text-white'
                      : 'rounded-bl-[5px] bg-white text-navy-700 dark:bg-navy-700 dark:text-white'
                  }`}
                >
                  {m.t}
                  <div className="mt-[5px] text-mini opacity-70">{m.at}</div>
                </div>
              ))
            ) : (
              <div className="m-auto text-center text-compact text-gray-600 dark:text-gray-400">
                还没有往来 —— Agent 已为你起草首封邀约，见下方。
              </div>
            )}
          </div>

          {/* V6-15..19 draft 区（原型 .draft）：dlbl+spark / textarea 可编辑 / 🔒 hint+shield / 重写 ghost / 🚪 发送红 gate */}
          <div className="border-t border-gray-100 px-5 py-4 dark:border-white/10">
            <div className="mb-2.5 flex items-center gap-[7px] text-xs font-bold text-brand-500 dark:text-white">
              <MdAutoAwesome className="h-4 w-4 shrink-0" aria-hidden />
              Agent 起草 · 可编辑后发送
            </div>
            {/* 改草稿 = internal：直接编辑，无弹窗（§9 二分） */}
            <textarea
              aria-label="邀约草稿"
              value={draftValue}
              onChange={(e) =>
                setDrafts((prev) => ({
                  ...prev,
                  [selected.id]: e.target.value,
                }))
              }
              className="min-h-[70px] w-full resize-y rounded-[14px] border border-gray-200 bg-lightPrimary p-3 text-compact leading-normal text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:focus:border-brand-400"
            />
            <div className="mt-[11px] flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-gray-400">
                <MdOutlineShield className="h-4 w-4 shrink-0" aria-hidden />
                发送是对外动作，会先让你确认
              </span>
              <span className="min-w-[8px] flex-1" />
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<MdOutlineEdit className="h-4 w-4" aria-hidden />}
                onClick={() => toast('Agent 已重写草稿')}
              >
                重写
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<MdSend className="h-4 w-4" aria-hidden />}
                onClick={() => setGate('send')}
              >
                发送
              </Button>
            </div>
          </div>
        </div>

        {/* ── 右栏档案（原型 .ib-ctx，<xl 隐藏与原型断点一致） ── */}
        <div className="hidden min-w-0 flex-col gap-4 overflow-y-auto border-gray-100 px-4 py-[18px] dark:border-white/10 xl:flex xl:border-l">
          {/* V6-20/21 受众匹配 ring 84（CircularProgress 中心 % 读数） */}
          <div>
            <CtxHeading center>受众匹配度</CtxHeading>
            {selected.match == null ? (
              // 裁决 #2：字段缺失 / 契约层 null → 「待核」，绝不填 0 冒充实测
              <div className="grid h-[84px] place-items-center text-compact font-bold text-gray-400">
                待核
              </div>
            ) : (
              <div className="mx-auto h-[84px] w-[84px]">
                <CircularProgress title="" percentage={selected.match} />
              </div>
            )}
          </div>
          {/* V6-22 创作者档案 4 行 kv（原型 .ctx-stat：平台/粉丝量/历史合作/当前阶段） */}
          <div>
            <CtxHeading>创作者档案</CtxHeading>
            <CtxStat k="平台" v={platName} />
            <CtxStat k="粉丝量" v={platFollowers ?? ''} />
            <CtxStat k="历史合作" v={selected.past} />
            <CtxStat k="当前阶段" v={selectedStage} />
          </div>
          {/* V6-23 「Agent 建议」段 */}
          <div>
            <CtxHeading>Agent 建议</CtxHeading>
            <p className="text-xs leading-[1.55] text-gray-600 dark:text-gray-400">
              {REACH_AGENT_ADVICE}
            </p>
          </div>
        </div>
      </SurfaceCard>

      {/* V6-24 🔒 底部语法差异宣示句（原型 L796 逐字，FR-7.10/7.11 与 Match 语法互斥宣示） */}
      <p className="mt-3.5 text-compact text-gray-600 dark:text-gray-400">
        整个环节聚焦
        <b className="text-navy-700 dark:text-white">一个人</b>
        ：左列谈到哪一步、中间对话与草稿、右侧这个人的匹配与档案——和「创作者匹配」的横向对比正好相反。
      </p>

      {/* 🚪 闸门 1：send_outreach（harm 2 行=收件人/动作，原型 L999 逐字；D6 mock 流） */}
      <GateConfirm
        isOpen={gate === 'send'}
        onClose={closeGate}
        onConfirm={confirmSend}
        title="确认发送对外邮件"
        harmRows={[
          { label: '收件人', value: `${selected.name} · ${platName}` },
          { label: '动作', value: '发送邀约邮件' },
        ]}
        irrevText="对外 · 发出后不可撤销"
        confirmText="确认发送"
      >
        你即将向 <b>{selected.name}</b> 发送一封邀约。
      </GateConfirm>

      {/* 🚪 闸门 2：commit_quote（harm 3 行=金额/交付内容/授权范围，原型 L1000 逐字；D6 mock 流） */}
      <GateConfirm
        isOpen={gate === 'quote'}
        onClose={closeGate}
        onConfirm={confirmQuote}
        title="确认价格承诺"
        harmRows={[
          { label: '金额', value: REACH_QUOTE.amount },
          { label: '交付内容', value: REACH_QUOTE.deliverable },
          { label: '授权范围', value: REACH_QUOTE.scope },
        ]}
        irrevText="对外 · 承诺后不可撤销"
        confirmText="确认报价"
      >
        向 <b>{selected.name}</b> 作出正式报价承诺前，请确认利害。
      </GateConfirm>
    </div>
  );
}
