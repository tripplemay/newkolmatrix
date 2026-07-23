'use client';
// ARCH-M05 F010 → M3-A-REACH-CRM F008 — Reach 三栏对话收件箱接真（V6 清单 24+2 元素，converse 语法）。
// 对照原型 `.inbox`（L784-796）：左人列（搜索 + ibrow×N 五态 pill）/ 中对话+草稿 / 右档案，
// 280 / minmax(0,1fr) / 240，min-h 540；整个环节聚焦一个人（FR-7.10 与 Match 横向对比刻意相反）。
//
// 数据源 = RSC 组装 `loadReachSurfaceData`（lib/reach/surface-data）：人列 = 真 thread ∪
// approved 组合成员（裁决 #5）；五态 pill = crmInfer 真值（三处复用铁律 ①）。mock env-reach 已退役。
//
// 🚪 闸门真链路（F008，D6 stub 全数替换）：发送 / 报价 = outbound →
//   POST /api/reach/{send,quote}（executeTool 薄封装 → pending 信封，副作用零发生）
//   → GET /api/actions/[id]（服务端详情，确认卡渲染**真 harm**，前端不改写不筛选——§9.5）
//   → POST /api/actions/[id]/confirm（签票）→ POST /api/actions/[id]/execute（消费票）
//   → router.refresh()（RSC 重组装，pill/对话随库更新）。
// internal / outbound 边界（§9）：改草稿 textarea 直编 + 「重写」refine_email（裁决 #4）无弹窗；
// 发送 / 报价过 GateConfirm。报价条款经前置最小表单输入（裁决 #1，V6-25 登记新增）。

import React from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalBody, ModalContent, ModalOverlay } from '@chakra-ui/modal';
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
import GateConfirm, {
  type GateHarmRow,
} from 'components/common/GateConfirm';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
// F007 既有件复用（只读，不改动）：原型 avatar() 色轮同规格
import ProjectAvatar from 'components/project/ProjectAvatar';
import {
  REACH_STAGE_TONE,
  type ReachStageLabel,
  type ReachStageTone,
  type ReachSurfaceData,
} from 'lib/display/reach-format';

/** 原型 .pill 四色调（与 campaigns 页 Pill 同规格；ac=brand 淡紫族） */
const PILL_TONE: Record<ReachStageTone, string> = {
  gd: 'bg-green-50 text-green-600',
  wn: 'bg-orange-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
  ac: 'bg-brand-50 text-brand-500 dark:bg-brand-400/10 dark:text-white',
  nu: 'bg-lightPrimary text-gray-600 dark:bg-navy-700 dark:text-gray-400',
};

/** V6-左3 🔒 五态阶段 pill（原型 ibrow 内 padding 2px 8px / font 10px 缩格；值=crmInfer 真值） */
function StagePill({ stage }: { stage: ReachStageLabel }) {
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

/** 真 harm 视图（GET /api/actions/[id] 返回；渲染不改写——§9.5 确认卡只做呈现） */
interface HarmView {
  action?: string;
  summary?: string;
  targets?: string[];
  amount?: number;
  currency?: string;
  scope?: string;
  evidence?: string;
  label?: string;
}

interface GateFlow {
  kind: 'send' | 'quote';
  pendingActionId: string;
  harm: HarmView;
}

/** 报价条款（V6-25：闸门前置最小表单，裁决 #1——人是条款唯一权威输入源） */
interface QuoteTermsDraft {
  amount: string;
  currency: string;
  deliverables: string;
  scope: string;
}

const EMPTY_TERMS: QuoteTermsDraft = {
  amount: '',
  currency: 'USD',
  deliverables: '',
  scope: '',
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function ConversationInbox({
  projectId,
  data,
}: {
  projectId: string;
  data: ReachSurfaceData;
}) {
  const toast = useToast();
  const router = useRouter();
  const people = data.people;
  const [selectedId, setSelectedId] = React.useState<string | null>(
    people[0]?.kolId ?? null,
  );
  /** 草稿本地编辑（internal：textarea 直编，无弹窗），按人暂存 */
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [gate, setGate] = React.useState<GateFlow | null>(null);
  const [busy, setBusy] = React.useState<
    'send-start' | 'quote-start' | 'refine' | 'confirm' | null
  >(null);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [terms, setTerms] = React.useState<QuoteTermsDraft>(EMPTY_TERMS);

  const selected =
    people.find((c) => c.kolId === selectedId) ?? people[0] ?? null;
  const selectedIndex = selected
    ? people.findIndex((c) => c.kolId === selected.kolId)
    : 0;
  /** 档案 平台/粉丝量 两行由 plat 拆分（原型 plat.split(' · ')） */
  const [platName, platFollowers] = (selected?.plat ?? '—').split(' · ');
  const draftValue = selected
    ? (drafts[selected.kolId] ?? selected.draft?.body ?? '')
    : '';

  const closeGate = () => setGate(null);

  /** 🚪 发送真链第一步：POST /api/reach/send → pending 信封 → GET 详情 → 确认卡（真 harm） */
  const startSend = async () => {
    if (!selected) return;
    if (!draftValue.trim()) {
      toast('草稿为空——先起草或书写正文再发送');
      return;
    }
    setBusy('send-start');
    try {
      const res = await fetch('/api/reach/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          kolId: selected.kolId,
          subject: selected.draft?.subject ?? undefined,
          body: draftValue,
        }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '发送发起失败')); // P3 明示拒绝原文透传
        return;
      }
      await openGateCard('send', String(out.pendingActionId));
    } finally {
      setBusy(null);
    }
  };

  /** 🚪 报价真链第一步（条款表单提交后）：POST /api/reach/quote → 信封 → GET 详情 → 确认卡 */
  const startQuote = async () => {
    if (!selected) return;
    const amount = Number(terms.amount);
    const deliverables = terms.deliverables
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!Number.isFinite(amount) || amount <= 0 || deliverables.length === 0) {
      toast('请填写正数金额与至少一项交付物'); // 仅格式提示；权威校验在服务端 zod（裁决叮嘱 ③）
      return;
    }
    setBusy('quote-start');
    try {
      const res = await fetch('/api/reach/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          kolId: selected.kolId,
          amount,
          currency: terms.currency.trim().toUpperCase(),
          deliverables,
          scope: terms.scope.trim() || undefined,
        }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '报价发起失败'));
        return;
      }
      setTermsOpen(false);
      await openGateCard('quote', String(out.pendingActionId));
    } finally {
      setBusy(null);
    }
  };

  /** GET /api/actions/[id]：确认卡以服务端详情为真相源（刷新/跨会话恢复同一入口） */
  const openGateCard = async (kind: GateFlow['kind'], id: string) => {
    const res = await fetch(`/api/actions/${id}`);
    const out = await readJson(res);
    if (!res.ok) {
      toast(String(out.error ?? '读取待确认动作失败'));
      return;
    }
    setGate({ kind, pendingActionId: id, harm: (out.harm ?? {}) as HarmView });
  };

  /** 🚪 两步票据：confirm 签票 → execute 消费票（票仅存在于本次链式调用，不落任何本地状态） */
  const confirmGate = async () => {
    if (!gate) return;
    setBusy('confirm');
    try {
      const confRes = await fetch(
        `/api/actions/${gate.pendingActionId}/confirm`,
        { method: 'POST' },
      );
      const conf = await readJson(confRes);
      if (!confRes.ok) {
        toast(String(conf.error ?? '确认失败'));
        setGate(null);
        return;
      }
      const execRes = await fetch(
        `/api/actions/${gate.pendingActionId}/execute`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticket: conf.ticket }),
        },
      );
      const exec = await readJson(execRes);
      if (!execRes.ok) {
        toast(String(exec.error ?? '执行失败'));
        setGate(null);
        return;
      }
      toast(gate.kind === 'send' ? '邀约已发送' : '报价已确认');
      setGate(null);
      if (selected && gate.kind === 'send') {
        // 已发送内容即刻出现在对话区（服务端为真相；本地仅清编辑暂存）
        setDrafts((prev) => {
          const { [selected.kolId]: _cleared, ...rest } = prev;
          return rest;
        });
      }
      router.refresh(); // RSC 重组装：pill / 对话 / 报价随库更新
    } finally {
      setBusy(null);
    }
  };

  /** 「重写」→ refine_email 真链（裁决 #4；internal 无弹窗，产出草稿已落库） */
  const rewrite = async () => {
    if (!selected) return;
    if (!draftValue.trim()) {
      toast('草稿为空——先书写或让 Agent 起草再重写');
      return;
    }
    setBusy('refine');
    try {
      const res = await fetch('/api/reach/refine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          kolId: selected.kolId,
          subject: selected.draft?.subject ?? '',
          body: draftValue,
        }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '重写失败'));
        return;
      }
      setDrafts((prev) => ({
        ...prev,
        [selected.kolId]: String(out.body ?? draftValue),
      }));
      toast('Agent 已重写草稿');
      router.refresh(); // 草稿行已落库（裁决 #3）
    } finally {
      setBusy(null);
    }
  };

  /** 确认卡行（渲染真 harm 字段，不改写不筛选——§9.5；行结构沿原型 2/3 行） */
  const gateRows: GateHarmRow[] =
    gate?.kind === 'send'
      ? [
          { label: '收件人', value: (gate.harm.targets ?? []).join('、') },
          { label: '动作', value: gate.harm.summary ?? '发送邀约邮件' },
        ]
      : gate
        ? [
            {
              label: '金额',
              value: `${gate.harm.amount ?? '—'} ${gate.harm.currency ?? ''}`,
            },
            { label: '交付内容', value: gate.harm.evidence ?? '—' },
            { label: '授权范围', value: gate.harm.scope ?? '—' },
          ]
        : [];

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
          {/* V6-3..7 ibrow ×N：avatar / 名 / 🔒 五态阶段 pill（crmInfer 真值）/ last 预览 / on 淡紫 */}
          <div className="flex-1 overflow-y-auto max-md:max-h-[220px]">
            {people.length === 0 ? (
              <div className="px-4 py-8 text-center text-compact text-gray-600 dark:text-gray-400">
                还没有触达对象——先在「创作者匹配」批准一个组合，成员会出现在这里。
              </div>
            ) : (
              people.map((c, i) => {
                const on = selected != null && c.kolId === selected.kolId;
                return (
                  <button
                    key={c.kolId}
                    type="button"
                    onClick={() => setSelectedId(c.kolId)}
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
                          <StagePill stage={c.stage} />
                        </span>
                      </div>
                      <p className="mt-[3px] truncate text-[11.5px] text-gray-600 dark:text-gray-400">
                        {c.last || '尚未开始往来'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── 中栏对话（原型 .ib-thread） ── */}
        <div className="flex min-w-0 flex-col">
          {/* V6-8..10 th-head：avatar / 名+sub / 🔒🚪 「确认报价」仅 谈判中 条件渲染（裁决 #6） */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/10">
            {selected ? (
              <>
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
                    {selected.plat} · {selected.stage}
                  </div>
                </div>
                <span className="flex-1" />
                {selected.stage === '谈判中' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<MdAttachMoney className="h-4 w-4" aria-hidden />}
                    onClick={() => {
                      setTerms(EMPTY_TERMS);
                      setTermsOpen(true);
                    }}
                  >
                    确认报价
                  </Button>
                )}
              </>
            ) : (
              <div className="text-compact text-gray-600 dark:text-gray-400">
                选择左列创作者后开始触达
              </div>
            )}
          </div>

          {/* V6-11..14 th-msgs 对话区：msg in 白左尖角 / out 渐变紫右尖角 / 时间戳 .mt / 🔒 空态句 */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-lightPrimary p-5 dark:bg-navy-800">
            {selected && selected.messages.length > 0 ? (
              selected.messages.map((m, i) => (
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
                {selected?.draft
                  ? '还没有往来 —— Agent 已为你起草首封邀约，见下方。'
                  : '还没有往来 —— 在下方书写，或到 Copilot 让触达 Agent 起草。'}
              </div>
            )}
          </div>

          {/* V6-15..19 draft 区（原型 .draft）：dlbl+spark / textarea 可编辑 / 🔒 hint+shield / 重写 ghost / 🚪 发送红 gate */}
          {selected && (
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
                    [selected.kolId]: e.target.value,
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
                  loading={busy === 'refine'}
                  leftIcon={<MdOutlineEdit className="h-4 w-4" aria-hidden />}
                  onClick={rewrite}
                >
                  重写
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy === 'send-start'}
                  leftIcon={<MdSend className="h-4 w-4" aria-hidden />}
                  onClick={startSend}
                >
                  发送
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── 右栏档案（原型 .ib-ctx，<xl 隐藏与原型断点一致） ── */}
        <div className="hidden min-w-0 flex-col gap-4 overflow-y-auto border-gray-100 px-4 py-[18px] dark:border-white/10 xl:flex xl:border-l">
          {/* V6-20/21 受众匹配 ring 84（CircularProgress 中心 % 读数） */}
          <div>
            <CtxHeading center>受众匹配度</CtxHeading>
            {selected?.match == null ? (
              // 裁决 #2：字段缺失 / 降级 → 「待核」，绝不填 0 冒充实测
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
            <CtxStat k="粉丝量" v={platFollowers ?? '—'} />
            <CtxStat k="历史合作" v={selected?.past ?? '—'} />
            <CtxStat k="当前阶段" v={selected?.stage ?? '—'} />
          </div>
          {/* V6-23 「Agent 建议」段（接真后为诚实占位：建议生成能力归 Copilot 对话，不在此杜撰） */}
          <div>
            <CtxHeading>Agent 建议</CtxHeading>
            <p className="text-xs leading-[1.55] text-gray-600 dark:text-gray-400">
              {selected && !selected.hasContactEmail
                ? '该创作者还没有联系邮箱——先在创作者库抽屉录入，才能发出邀约。'
                : '与触达 Agent 对话可获得针对此人的邀约与谈判建议。'}
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

      {/* V6-25 报价条款表单（裁决 #1 新增登记：闸门前置输入，非画布区块） */}
      <Modal isOpen={termsOpen} onClose={() => setTermsOpen(false)} isCentered>
        <ModalOverlay className="!bg-navy-900/50 backdrop-blur-sm" />
        <ModalContent className="!m-auto !w-[min(440px,calc(100vw-48px))] !max-w-[440px] overflow-hidden !rounded-[20px] !bg-white !shadow-2xl dark:!bg-navy-800">
          <ModalBody className="!p-6">
            <div className="mb-4 text-[15px] font-bold text-navy-700 dark:text-white">
              报价条款
            </div>
            <div className="flex flex-col gap-3 text-compact">
              <label className="flex items-center gap-2">
                <span className="w-[72px] shrink-0 text-gray-600 dark:text-gray-400">
                  金额
                </span>
                <input
                  type="number"
                  min={0}
                  value={terms.amount}
                  onChange={(e) =>
                    setTerms((t) => ({ ...t, amount: e.target.value }))
                  }
                  placeholder="如 1500"
                  className="w-full rounded-[10px] border border-gray-200 bg-lightPrimary px-3 py-2 text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />
                <input
                  aria-label="币种"
                  value={terms.currency}
                  onChange={(e) =>
                    setTerms((t) => ({ ...t, currency: e.target.value }))
                  }
                  className="w-[72px] shrink-0 rounded-[10px] border border-gray-200 bg-lightPrimary px-3 py-2 text-center text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />
              </label>
              <label className="flex items-start gap-2">
                <span className="w-[72px] shrink-0 pt-2 text-gray-600 dark:text-gray-400">
                  交付物
                </span>
                <textarea
                  value={terms.deliverables}
                  onChange={(e) =>
                    setTerms((t) => ({ ...t, deliverables: e.target.value }))
                  }
                  placeholder={'一行一项，如：\n1 条长视频\n2 条 shorts'}
                  className="min-h-[64px] w-full resize-y rounded-[10px] border border-gray-200 bg-lightPrimary px-3 py-2 text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="w-[72px] shrink-0 text-gray-600 dark:text-gray-400">
                  授权范围
                </span>
                <input
                  value={terms.scope}
                  onChange={(e) =>
                    setTerms((t) => ({ ...t, scope: e.target.value }))
                  }
                  placeholder="如：项目内使用 90 天（可留空）"
                  className="w-full rounded-[10px] border border-gray-200 bg-lightPrimary px-3 py-2 text-navy-700 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setTermsOpen(false)}>
                取消
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'quote-start'}
                onClick={startQuote}
              >
                下一步：确认利害
              </Button>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 🚪 闸门确认卡：渲染服务端真 harm（send 2 行 / quote 3 行，原型 L999/L1000 行结构） */}
      <GateConfirm
        isOpen={gate != null}
        onClose={closeGate}
        onConfirm={confirmGate}
        confirmLoading={busy === 'confirm'}
        title={gate?.kind === 'quote' ? '确认价格承诺' : '确认发送对外邮件'}
        harmRows={gateRows}
        irrevText={
          gate?.kind === 'quote'
            ? '对外 · 承诺后不可撤销'
            : '对外 · 发出后不可撤销'
        }
        confirmText={gate?.kind === 'quote' ? '确认报价' : '确认发送'}
      >
        {gate?.kind === 'quote' ? (
          <>
            向 <b>{selected?.name}</b> 作出正式报价承诺前，请确认利害。
          </>
        ) : (
          <>
            你即将向 <b>{selected?.name}</b> 发送一封邀约。
          </>
        )}
      </GateConfirm>
    </div>
  );
}
