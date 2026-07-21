// ARCH-M05 F007 — 项目详情外壳（V3 全 14 元素，原型 viewProject L747-753）
//
// pback 返回卡 + 项目头（名 23px/800 · goal 78ch · pmeta 预算/健康度三色 dot/负责人）
// + `.rail` 环节导轨 ×5（🔒 rn-step 01-05 · rn-ico 三态 · rn-state 三文案 · 🔒 on 渐变紫 · 横滚）
// + 🔒 surf-label 语法徽标 + 🔒「刻意不同」宣示句 + 落地面挂载（components/envs/<env> 静态映射）。
//
// URL 即状态（D7/裁决 #4）：?env=brief|match|reach|delivery|insight；rnode 点击切 ?env=
//（router.replace，页内 tab 语义不变，D22：五环节非路由）。兼容旧深链：读到 ?stage=
// 即 router.replace 重写为 ?env=（F007 迁移，kimi §6.1）。
// D2 渲染契约：项目未命中 mock → 名回退 projectId、其余字段渲染「待补充」，绝不抛错。

'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdCheck, MdOutlinePayments } from 'react-icons/md';
import {
  STAGES,
  isStage,
  stageHref,
  type Stage,
} from 'lib/agent/stage-routing';
import {
  getMockProject,
  HEALTH_LABEL,
  type ProjectHealth,
} from 'lib/data/mock/projects';
import { PENDING_TEXT } from 'lib/data/provenance';
import BriefEnv from 'components/envs/brief';
import MatchEnv from 'components/envs/match';
import ReachEnv from 'components/envs/reach';
import DeliveryEnv from 'components/envs/delivery';
import InsightEnv from 'components/envs/insight';
import { ENV_META } from './env-meta';

// 落地面挂载契约（F007）：env → components/envs/<env> 静态映射；
// 各 stub 由 F008-F012 以同名 default export（props { projectId }）整体替换。
const ENV_SURFACE: Record<Stage, ComponentType<{ projectId: string }>> = {
  brief: BriefEnv,
  match: MatchEnv,
  reach: ReachEnv,
  delivery: DeliveryEnv,
  insight: InsightEnv,
};

/** pmeta 健康度三色 dot（原型 .dot gd/wn/cr） */
const DOT_TONE: Record<ProjectHealth, string> = {
  gd: 'bg-green-500',
  wn: 'bg-amber-500',
  cr: 'bg-red-500',
};

export default function ProjectDetail({
  projectId,
  initialEnv,
  legacyStage,
}: {
  projectId: string;
  /** URL ?env=（canonical，kimi §6.1） */
  initialEnv?: string;
  /** URL ?stage=（旧深链，读到即重写为 ?env=） */
  legacyStage?: string;
}) {
  const router = useRouter();
  const project = getMockProject(projectId);

  // 初始环节：?env= 优先 → 旧 ?stage= → 项目当前推进环节（原型 data-goenv=p.cur 语义）→ brief 兜底。
  const fromUrl = initialEnv ?? legacyStage;
  const start: Stage =
    fromUrl && isStage(fromUrl) ? fromUrl : project?.cur ?? 'brief';
  const [env, setEnv] = useState<Stage>(start);

  // 兼容旧深链：?stage= 读到即 router.replace 重写为 ?env=（不留历史条目，F007 迁移）。
  useEffect(() => {
    if (!initialEnv && legacyStage && isStage(legacyStage)) {
      router.replace(stageHref(projectId, legacyStage), { scroll: false });
    }
  }, [initialEnv, legacyStage, projectId, router]);

  const selectEnv = (next: Stage) => {
    setEnv(next);
    // 同步 URL ?env=（router.replace 非硬跳转，保持页内 tab 语义，D22）。
    router.replace(stageHref(projectId, next), { scroll: false });
  };

  const cur: Stage = project?.cur ?? start;
  const curIdx = STAGES.indexOf(cur);
  const meta = ENV_META[env];
  const Surface = ENV_SURFACE[env];
  const health = project?.health ?? null;

  return (
    <div className="mt-3">
      {/* V3-1 pback 返回卡 + V3-2/3/4 项目头（原型 .phead） */}
      <div className="mb-5 mt-1.5 flex items-start gap-4">
        <button
          type="button"
          title="返回"
          aria-label="返回项目列表"
          onClick={() => router.push('/admin/campaigns')}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-gray-200 bg-white text-gray-600 transition hover:text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-gray-400 dark:hover:text-white"
        >
          <MdArrowBack size={20} />
        </button>
        <div className="min-w-0">
          {/* V3-2 项目名 23px/800 */}
          <h2 className="text-[23px] font-extrabold leading-tight text-navy-700 dark:text-white">
            {project?.name ?? projectId}
          </h2>
          {/* V3-3 goal（max-w 78ch） */}
          <p className="mt-[7px] max-w-[78ch] text-[13.5px] text-gray-600 dark:text-gray-400">
            {project?.goal ?? PENDING_TEXT.fill}
          </p>
          {/* V3-4 pmeta 预算 / 健康度三色 dot / 负责人 */}
          <div className="mt-3 flex flex-wrap gap-x-[22px] gap-y-2">
            <span className="flex items-center gap-[7px] text-[12.5px] text-gray-600 dark:text-gray-400">
              <MdOutlinePayments size={14} />
              预算{' '}
              <b className="text-navy-700 dark:text-white">
                {project?.budget ?? PENDING_TEXT.fill}
              </b>
            </span>
            <span className="flex items-center gap-[7px] text-[12.5px] text-gray-600 dark:text-gray-400">
              <span
                className={`h-[9px] w-[9px] shrink-0 rounded-full ${
                  health ? DOT_TONE[health] : 'bg-gray-300'
                }`}
              />
              健康度{' '}
              <b className="text-navy-700 dark:text-white">
                {health ? HEALTH_LABEL[health] : PENDING_TEXT.fill}
              </b>
            </span>
            <span className="flex items-center gap-[7px] text-[12.5px] text-gray-600 dark:text-gray-400">
              负责人{' '}
              <b className="text-navy-700 dark:text-white">
                {project?.owner ?? PENDING_TEXT.fill}
              </b>
            </span>
          </div>
        </div>
      </div>

      {/* V3-5~12 `.rail` 环节导轨 ×5（横滚 min-w 150；rnode 点击切 ?env=） */}
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const m = ENV_META[s];
          const done = i < curIdx;
          const on = s === env;
          const state = done ? '已完成' : i === curIdx ? '进行中' : '未开始';
          const Icon = done ? MdCheck : m.icon;
          return (
            <button
              key={s}
              type="button"
              onClick={() => selectEnv(s)}
              aria-pressed={on}
              className={`relative flex min-w-[150px] flex-1 flex-col items-start gap-[11px] rounded-2xl p-[18px] text-left transition duration-150 hover:-translate-y-0.5 ${
                on
                  ? // 🔒 V3-12 on 态渐变紫底
                    'border border-transparent bg-gradient-to-br from-brand-400 to-brand-500'
                  : 'border border-gray-200 bg-white hover:shadow-xl dark:border-white/10 dark:bg-navy-700'
              }`}
            >
              {/* 🔒 V3-8 rn-step 序号 01-05 */}
              <span
                className={`absolute right-4 top-3.5 text-micro font-extrabold tabular-nums ${
                  on ? 'text-white/60' : 'text-gray-400'
                }`}
              >
                0{i + 1}
              </span>
              {/* V3-9 rn-ico 三态：done 绿 check / on 白透明 / 未开始灰 */}
              <span
                className={`grid h-[42px] w-[42px] place-items-center rounded-[13px] ${
                  on
                    ? 'bg-white/20 text-white'
                    : done
                      ? 'bg-green-50 text-green-600'
                      : 'bg-lightPrimary text-gray-400 dark:bg-navy-900'
                }`}
              >
                <Icon size={18} />
              </span>
              {/* V3-10 rn-name */}
              <span
                className={`text-sm font-bold ${
                  on ? 'text-white' : 'text-navy-700 dark:text-white'
                }`}
              >
                {m.name}
              </span>
              {/* V3-11 rn-state 三文案 */}
              <span
                className={`text-[11.5px] ${
                  on ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {state}
              </span>
            </button>
          );
        })}
      </div>

      {/* 🔒 V3-13 surf-label 语法徽标 + 🔒 V3-14「刻意不同」宣示句（原型 .surf-label） */}
      <div className="mb-4 mt-[22px] flex items-center gap-[11px]">
        <span className="rounded-[9px] bg-gradient-to-br from-brand-400 to-brand-500 px-3 py-1.5 text-micro font-extrabold tracking-wide text-white">
          {meta.grammar}
        </span>
        <span className="text-compact text-gray-600 dark:text-gray-400">
          {meta.verb} — 这一环节的界面与其它环节刻意不同
        </span>
      </div>

      {/* 落地面：env → components/envs/<env> 静态映射（F008-F012 替换 stub） */}
      <Surface projectId={projectId} />
    </div>
  );
}
