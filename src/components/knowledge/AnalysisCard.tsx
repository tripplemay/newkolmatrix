'use client';
// ARCH-M05 F014 — 游戏特点卡（原型 kb-analysis 区，V11 #8-#13）。
// - 「策略 Agent 分析出的游戏特点」+ spark
// - 🔒 kb-prov 溯源行：ProvenanceTag variant="inline"（裁决 #10），
//   provenance 经 resolveProvenance(game, 'analysis') 取契约层，label 覆盖为原型 from 文案
// - 卖点 bullet ×3（brand 圆点）
// - 目标受众 components/progress ×3（游戏主题色经 barColor prop，不 fork 模板件）
// - 合规红线 ×3（红 shield）
// - 🔒 kb-use 跨 Agent 消费链宣示（匹配用受众 · 触达用卖点 · 合规用红线）

import { MdAutoAwesome, MdShield } from 'react-icons/md';
import Card from 'components/card';
import Progress from 'components/progress';
import ProvenanceTag from 'components/common/ProvenanceTag';
import KbHeading from './KbHeading';
import { resolveProvenance } from 'lib/data/provenance';
import type { GameKnowledgeEntry } from 'lib/data/mock/knowledge';

export default function AnalysisCard({ game }: { game: GameKnowledgeEntry }) {
  return (
    <Card extra="!p-[22px] mt-5">
      {/* kb-analysis-h */}
      <div className="flex items-center gap-2 text-compact font-bold text-navy-700 dark:text-white">
        <MdAutoAwesome
          className="h-3.5 w-3.5 shrink-0 text-brand-500 dark:text-brand-400"
          aria-hidden
        />
        策略 Agent 分析出的游戏特点
      </div>

      {/* 🔒 kb-prov 溯源行（inline variant，label 覆盖 = 原型 from 逐字） */}
      <div className="mb-0.5 ml-[25px] mt-1.5">
        <ProvenanceTag
          variant="inline"
          provenance={resolveProvenance(game, 'analysis')}
          label={game.from}
        />
      </div>

      {/* 卖点 bul ×3 */}
      <div className="mt-3.5">
        <KbHeading className="mb-2">卖点</KbHeading>
        <ul className="flex flex-col gap-[7px]">
          {game.sell.map((s) => (
            <li
              key={s}
              className="relative pl-4 text-compact leading-[1.45] text-navy-700 before:absolute before:left-0.5 before:top-2 before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-500 before:content-[''] dark:text-white dark:before:bg-brand-400"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* 目标受众 Progress ×3（游戏主题色） */}
      <div className="mt-[18px]">
        <KbHeading className="mb-2">目标受众</KbHeading>
        <div className="flex flex-col gap-[9px]">
          {game.aud.map((a) => (
            <div
              key={a.label}
              className="grid grid-cols-[100px_minmax(0,1fr)_42px] items-center gap-2.5 text-xs text-gray-600 dark:text-gray-400"
            >
              <span className="truncate">{a.label}</span>
              <Progress value={a.percent} barColor={game.color} />
              <b className="text-right font-bold tabular-nums text-navy-700 dark:text-white">
                {a.percent}%
              </b>
            </div>
          ))}
        </div>
      </div>

      {/* 合规红线 ×3（红 shield） */}
      <div className="mt-[18px]">
        <KbHeading className="mb-2">合规红线</KbHeading>
        <div className="flex flex-col gap-2">
          {game.rules.map((r) => (
            <div
              key={r}
              className="flex items-center gap-2 text-xs text-navy-700 dark:text-white"
            >
              <MdShield
                className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400"
                aria-hidden
              />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 🔒 kb-use 跨 Agent 消费链宣示 */}
      <div className="mt-[18px] flex items-start gap-2 rounded-xl bg-lightPrimary px-[13px] py-[11px] text-micro leading-normal text-gray-600 dark:bg-navy-700 dark:text-gray-400">
        <MdAutoAwesome
          className="mt-px h-3.5 w-3.5 shrink-0 text-brand-500 dark:text-brand-400"
          aria-hidden
        />
        <span>{game.use}</span>
      </div>
    </Card>
  );
}
