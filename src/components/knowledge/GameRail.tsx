'use client';
// ARCH-M05 F014 — 游戏知识左栏游戏列表（原型 .kb-list / .kb-item，V11 #3）。
// 主题彩点 + 游戏名 + N 份素材；选中态淡紫（bg-brand-50）。
// 选中切换由父级回调（kbGame URL 化 ?game=，裁决 #4 / D7）。

import Card from 'components/card';
import KbHeading from './KbHeading';
import type { GameKnowledgeEntry } from 'lib/data/mock/knowledge';

export interface GameRailProps {
  games: GameKnowledgeEntry[];
  activeId: string;
  /** 各游戏实时素材数（上传后与 mock 初始值不同步，由页面态提供） */
  materialCount: (gameId: string) => number;
  onSelect: (gameId: string) => void;
}

export default function GameRail({
  games,
  activeId,
  materialCount,
  onSelect,
}: GameRailProps) {
  return (
    <Card extra="!p-3">
      <KbHeading className="px-2.5 py-2">游戏</KbHeading>
      {games.map((g) => {
        const on = g.id === activeId;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(g.id)}
            className={`flex w-full items-center gap-[11px] rounded-xl p-[11px] text-left transition ${
              on
                ? 'bg-brand-50 dark:bg-brand-400/10'
                : 'hover:bg-lightPrimary dark:hover:bg-navy-700'
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: g.color }}
              aria-hidden
            />
            <span className="min-w-0">
              <b className="block truncate text-compact font-bold text-navy-700 dark:text-white">
                {g.game}
              </b>
              <small className="text-micro text-gray-600 dark:text-gray-400">
                {materialCount(g.id)} 份素材
              </small>
            </span>
          </button>
        );
      })}
    </Card>
  );
}
