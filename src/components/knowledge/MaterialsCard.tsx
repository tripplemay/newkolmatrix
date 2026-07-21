'use client';
// ARCH-M05 F014 — 素材库卡（原型 kb-dhead / dropzone / .mat 行，V11 #4-#7）。
// - kb-dhead：游戏色图标 48（color1A 底，沿 AgentSquad 数据驱动色先例）+ 名 + 2 pill +
//   「重新分析」ghost（Toast 双段反馈由父级处理）
// - UploadZone（common）：上传 → 父级插 analyzing 行 + Toast → 1.1s 转 done + 二次 Toast
// - mat 行：🔒 按 type 分图标（doc/video/data/image）+ 🔒 状态二态
//   （done 绿「AI 已解析」/ analyzing 琥珀「解析中…」——异步中间态不得省）

import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdCheck,
  MdOutlineBarChart,
  MdOutlineDescription,
  MdOutlineImage,
  MdOutlinePlayCircle,
  MdOutlineSportsEsports,
} from 'react-icons/md';
import Card from 'components/card';
import Button from 'components/common/Button';
import UploadZone from 'components/common/UploadZone';
import KbHeading from './KbHeading';
import type {
  GameKnowledgeEntry,
  KnowledgeMaterial,
  MaterialType,
} from 'lib/data/mock/knowledge';

/** 原型 mIc：素材类型 → 图标（🔒 按 type 分，不得合并） */
const MATERIAL_ICONS: Record<MaterialType, IconType> = {
  doc: MdOutlineDescription,
  video: MdOutlinePlayCircle,
  data: MdOutlineBarChart,
  image: MdOutlineImage,
};

function NeutralPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-lightPrimary px-3 py-[5px] text-micro font-bold text-gray-600 dark:bg-navy-700 dark:text-gray-400">
      {children}
    </span>
  );
}

/** 🔒 状态二态（原型 mStat）：done 绿 check「AI 已解析」/ analyzing 琥珀 spark「解析中…」 */
function MaterialStatusBadge({ status }: { status: KnowledgeMaterial['status'] }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-green-500 dark:text-green-400">
        <MdCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        AI 已解析
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 dark:text-amber-400">
      <MdAutoAwesome className="h-3.5 w-3.5 shrink-0" aria-hidden />
      解析中…
    </span>
  );
}

export interface MaterialsCardProps {
  game: GameKnowledgeEntry;
  /** 页面态素材列表（含上传插入的 analyzing 行） */
  materials: KnowledgeMaterial[];
  onUpload: () => void;
  onReanalyze: () => void;
}

export default function MaterialsCard({
  game,
  materials,
  onUpload,
  onReanalyze,
}: MaterialsCardProps) {
  return (
    <Card extra="!p-[22px]">
      {/* kb-dhead：游戏色图标 48 + 名 + 2 pill + 重新分析 ghost */}
      <div className="flex items-center gap-[13px]">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]"
          style={{ backgroundColor: `${game.color}1A`, color: game.color }}
          aria-hidden
        >
          <MdOutlineSportsEsports className="h-[22px] w-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-lg font-bold text-navy-700 dark:text-white">
            {game.game}
          </b>
          <div className="mt-1.5 flex gap-1.5">
            <NeutralPill>{game.genre}</NeutralPill>
            <NeutralPill>{game.market}</NeutralPill>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReanalyze}
          leftIcon={<MdAutoAwesome className="h-3.5 w-3.5" aria-hidden />}
        >
          重新分析
        </Button>
      </div>

      {/* 素材库 · N 份 */}
      <KbHeading className="mt-5">素材库 · {materials.length} 份</KbHeading>

      {/* UploadZone（common）：文案逐字原型 dropzone */}
      <UploadZone
        className="mt-[11px]"
        onFiles={onUpload}
        title="上传素材"
        hint="拖拽或点击上传 · 设定集 / 美术 / 玩法文档 / 评测 / 数据"
      />

      {/* mat 行列表 */}
      <div className="mt-2.5 flex flex-col">
        {materials.map((m, i) => {
          const Icon = MATERIAL_ICONS[m.type];
          return (
            <div
              key={`${m.name}-${i}`}
              className="flex items-center gap-3 border-b border-gray-100 px-1 py-[11px] last:border-b-0 dark:border-white/10"
            >
              <span
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-lightPrimary text-gray-600 dark:bg-navy-700 dark:text-gray-400"
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-compact font-bold text-navy-700 dark:text-white">
                  {m.name}
                </b>
                <small className="text-micro text-gray-600 dark:text-gray-400">
                  {m.src} · {m.date}
                </small>
              </div>
              <MaterialStatusBadge status={m.status} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
