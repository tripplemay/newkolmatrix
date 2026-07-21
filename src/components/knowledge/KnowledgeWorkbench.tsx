'use client';
// ARCH-M05 F014 — 游戏知识工作台（V11 全 19 元素容器）。
//
// - kbGame URL 化（裁决 #4 / D7）：?game= 为唯一游戏选中态，切换 router.replace 同步
//   （沿 ProjectDetail ?stage= 先例，非硬跳转）；非法值回退首个游戏（D2 不抛错）。
// - 上传 mock 时序（原型 L993 逐字）：插 analyzing 行 + Toast「已上传《…》，策略 Agent
//   正在解析…」→ 1.1s 转 done + 二次 Toast「解析完成，游戏特点已更新」。
//   真实解析管道归 M1 knowledge 域（mock stub，素材名按原型循环表合成）。
// - 「重新分析」Toast 双段反馈（原型 L994）：「策略 Agent 正在重新分析全部素材…」→
//   1s「游戏特点已刷新」。
// - 素材列表为页面态（按游戏 id 分桶，不可变更新）；卸载时清理全部定时器。

import React from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from 'components/common/PageHeader';
import { useToast } from 'components/common/Toast';
import GameRail from './GameRail';
import MaterialsCard from './MaterialsCard';
import AnalysisCard from './AnalysisCard';
import {
  MOCK_ANALYZE_MS,
  MOCK_REANALYZE_MS,
  findGameKnowledge,
  mockGameKnowledge,
  nextUploadMaterial,
  type KnowledgeMaterial,
} from 'lib/data/mock/knowledge';

export default function KnowledgeWorkbench({
  initialGame,
}: {
  initialGame?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [activeId, setActiveId] = React.useState<string>(
    () => findGameKnowledge(initialGame).id,
  );
  // 素材页面态：游戏 id → 列表（初始 = mock；上传插入 analyzing 行后独立演进）
  const [materialsByGame, setMaterialsByGame] = React.useState<
    Record<string, KnowledgeMaterial[]>
  >(() =>
    Object.fromEntries(mockGameKnowledge.map((g) => [g.id, g.materials])),
  );
  const timersRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const schedule = React.useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  const game = findGameKnowledge(activeId);
  const materials = materialsByGame[game.id] ?? game.materials;

  const selectGame = (id: string) => {
    setActiveId(id);
    // kbGame URL 化：同步 ?game=（非硬跳转，保持页内切换语义）
    router.replace(`/admin/knowledge?game=${id}`, { scroll: false });
  };

  const handleUpload = () => {
    const gameId = game.id;
    const inserted = nextUploadMaterial(materials.length);
    setMaterialsByGame((prev) => ({
      ...prev,
      [gameId]: [...(prev[gameId] ?? []), inserted],
    }));
    toast(`已上传《${inserted.name}》，策略 Agent 正在解析…`);
    schedule(() => {
      setMaterialsByGame((prev) => ({
        ...prev,
        [gameId]: (prev[gameId] ?? []).map((m) =>
          m === inserted ? { ...m, status: 'done' } : m,
        ),
      }));
      toast('解析完成，游戏特点已更新');
    }, MOCK_ANALYZE_MS);
  };

  const handleReanalyze = () => {
    toast('策略 Agent 正在重新分析全部素材…');
    schedule(() => toast('游戏特点已刷新'), MOCK_REANALYZE_MS);
  };

  return (
    <div className="mt-3">
      <PageHeader
        title="游戏知识"
        subtitle={
          <span className="block max-w-[76ch]">
            每个游戏的知识库由<b>你上传的素材</b>
            构成（设定集 / 美术 / 玩法文档 / 评测 /
            数据）。策略 Agent 解析素材 → 提炼游戏特点 →
            喂给匹配、触达、合规各环节做决策。
          </span>
        }
      />
      <div className="mt-[22px] grid grid-cols-1 items-start gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
        <GameRail
          games={mockGameKnowledge}
          activeId={game.id}
          materialCount={(id) =>
            (materialsByGame[id] ?? findGameKnowledge(id).materials).length
          }
          onSelect={selectGame}
        />
        <div className="min-w-0">
          <MaterialsCard
            game={game}
            materials={materials}
            onUpload={handleUpload}
            onReanalyze={handleReanalyze}
          />
          <AnalysisCard game={game} />
        </div>
      </div>
    </div>
  );
}
