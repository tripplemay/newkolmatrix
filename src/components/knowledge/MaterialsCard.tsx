'use client';
// ARCH-M05 F014 → M1-D F004 接真 — 素材库卡（原型 kb-dhead / dropzone / .mat 行，V11 #4-#7）。
// - kb-dhead：游戏色图标 48（color1A 底）+ 名 + 2 pill（DB 无 genre/market 列 → '—' 占位，
//   保区块结构不自创数据）+ 「重新分析」ghost
// - UploadZone（common）：onFiles 透传真实 File[] → 父级 POST /api/materials + parse + 轮询
// - mat 行：🔒 按 icon 槽位分图标（doc/video/data/image）+ 状态三态
//   （done 绿「AI 已解析」/ analyzing 琥珀「解析中…」/ failed 红「解析失败」+ parseError 明示，D2）
// - 空素材 →「上传素材开始分析」可见文案（D2 空态）

import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdCheck,
  MdErrorOutline,
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
  KnowledgeGameData,
  KnowledgeMaterialView,
  MaterialIconKind,
} from 'lib/knowledge/page-contract';

/** 原型 mIc：图标槽位 → 图标（🔒 按槽位分，不得合并） */
const MATERIAL_ICONS: Record<MaterialIconKind, IconType> = {
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

/** 状态三态（接真扩展）：done 绿 / analyzing 琥珀 / failed 红（parseError 行内另示）。 */
function MaterialStatusBadge({ status }: { status: KnowledgeMaterialView['status'] }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-green-500 dark:text-green-400">
        <MdCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        AI 已解析
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 dark:text-red-400">
        <MdErrorOutline className="h-3.5 w-3.5 shrink-0" aria-hidden />
        解析失败
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
  game: KnowledgeGameData;
  /** 页面态素材列表（上传/轮询后与服务端初始值不同步） */
  materials: KnowledgeMaterialView[];
  onUpload: (files: File[]) => void;
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
            {game.name}
          </b>
          {/* DB Game 无 genre/market 列（M1-D 不建）：'—' 占位保结构（D2，不自创数据） */}
          <div className="mt-1.5 flex gap-1.5">
            <NeutralPill>—</NeutralPill>
            <NeutralPill>—</NeutralPill>
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

      {/* UploadZone（common）：真实文件流 → 父级上传+解析+轮询 */}
      <UploadZone
        className="mt-[11px]"
        onFiles={onUpload}
        title="上传素材"
        hint="拖拽或点击上传 · 设定集 / 美术 / 玩法文档 / 评测 / 数据"
      />

      {/* mat 行列表（空 → 可见空态文案，D2） */}
      {materials.length === 0 ? (
        <p className="mt-4 text-center text-xs text-gray-600 dark:text-gray-400">
          上传素材开始分析
        </p>
      ) : (
        <div className="mt-2.5 flex flex-col">
          {materials.map((m) => {
            const Icon = MATERIAL_ICONS[m.icon];
            return (
              <div
                key={m.id}
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
                  {/* failed 红态 parseError 明示（D2 诚实降级，可见不藏 tooltip） */}
                  {m.status === 'failed' && m.parseError ? (
                    <small className="block text-micro text-red-500 dark:text-red-400">
                      {m.parseError}
                    </small>
                  ) : null}
                </div>
                <MaterialStatusBadge status={m.status} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
