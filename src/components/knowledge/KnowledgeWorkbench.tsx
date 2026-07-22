'use client';
// ARCH-M05 F014 → M1-D F004 接真 — 游戏知识工作台。
//
// - kbGame URL 化（裁决 #4 / D7）：?game= 为唯一游戏选中态，切换 router.replace 同步；
//   非法值回退首个游戏（D2 不抛错，findKnowledgeGame）。
// - 真实上传动线（取代 mock setTimeout 时序）：UploadZone onFiles → POST /api/materials
//   （失败 400/413/429 → toast 明示错误，D2）→ Toast「已上传…解析中」→ 自动 POST
//   /api/materials/{id}/parse → 轮询 GET /api/materials?gameId= 至 parsed/failed →
//   router.refresh() 刷新 RSC 数据（特点卡随链头更新）+ 结果 Toast。
// - 「重新分析」：对当前游戏全部已解析/失败素材逐个 POST parse（analyzing 中的跳过），
//   双段 Toast 反馈。
// - 素材列表为页面态（按游戏 id 分桶；服务端初始 + 轮询覆盖，不可变更新）；卸载停轮询。

import React from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from 'components/common/PageHeader';
import { useToast } from 'components/common/Toast';
import GameRail from './GameRail';
import MaterialsCard from './MaterialsCard';
import AnalysisCard from './AnalysisCard';
import type { MaterialDto } from 'lib/knowledge/dto';
import {
  findKnowledgeGame,
  toMaterialView,
  type KnowledgeGameData,
  type KnowledgeMaterialView,
} from 'lib/knowledge/page-contract';

const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 90_000;

/** 按扩展名推断素材类型（DB MaterialType；UI 无类型选择器，服务端仍会白名单校验）。 */
function inferMaterialType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'art';
  if (ext === 'csv') return 'data';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  return 'lore';
}

export default function KnowledgeWorkbench({
  games,
  initialGame,
}: {
  games: KnowledgeGameData[];
  initialGame?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = findKnowledgeGame(games, initialGame);
  const [activeId, setActiveId] = React.useState<string | null>(
    initial ? initial.id : null,
  );
  // 素材页面态：游戏 id → 视图行（初始 = 服务端组装；上传/轮询后覆盖桶）
  const [materialsByGame, setMaterialsByGame] = React.useState<
    Record<string, KnowledgeMaterialView[]>
  >(() => Object.fromEntries(games.map((g) => [g.id, g.materials])));
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // RSC 数据更新（router.refresh 后 games prop 变化）→ 同步页面态桶
  React.useEffect(() => {
    setMaterialsByGame(
      Object.fromEntries(games.map((g) => [g.id, g.materials])),
    );
  }, [games]);

  /** 拉一次列表并覆盖该游戏的桶；返回最新 DTO 列表（失败返回 null，不打死页面）。 */
  const refreshMaterials = React.useCallback(
    async (gameId: string): Promise<MaterialDto[] | null> => {
      try {
        const res = await fetch(`/api/materials?gameId=${gameId}`);
        if (!res.ok) return null;
        const { materials } = (await res.json()) as {
          materials: MaterialDto[];
        };
        if (aliveRef.current) {
          const now = new Date();
          setMaterialsByGame((prev) => ({
            ...prev,
            [gameId]: materials.map((m) => toMaterialView(m, now)),
          }));
        }
        return materials;
      } catch {
        return null;
      }
    },
    [],
  );

  /** 轮询至指定素材 parsed/failed（或超时）。返回终态 DTO 或 null。 */
  const pollUntilSettled = React.useCallback(
    async (gameId: string, materialId: string): Promise<MaterialDto | null> => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (aliveRef.current && Date.now() < deadline) {
        const list = await refreshMaterials(gameId);
        const target = list?.find((m) => m.id === materialId);
        if (
          target &&
          (target.parseStatus === 'parsed' || target.parseStatus === 'failed')
        ) {
          return target;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      return null;
    },
    [refreshMaterials],
  );

  const activeGame = activeId ? findKnowledgeGame(games, activeId) : null;

  const selectGame = (id: string) => {
    setActiveId(id);
    // kbGame URL 化：同步 ?game=（非硬跳转，保持页内切换语义）
    router.replace(`/admin/knowledge?game=${id}`, { scroll: false });
  };

  const handleUpload = async (files: File[]) => {
    if (!activeGame) return;
    const gameId = activeGame.id;
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('gameId', gameId);
      fd.append('type', inferMaterialType(file.name));
      let materialId: string;
      try {
        const res = await fetch('/api/materials', { method: 'POST', body: fd });
        const body = (await res.json()) as {
          material?: MaterialDto;
          error?: string;
        };
        if (!res.ok || !body.material) {
          toast(`上传失败：${body.error ?? `HTTP ${res.status}`}`);
          continue;
        }
        materialId = body.material.id;
      } catch {
        toast('上传失败：网络错误，请重试');
        continue;
      }
      toast(`已上传《${file.name}》，策略 Agent 正在解析…`);
      await refreshMaterials(gameId); // 立即显示 pending 行

      if (inferMaterialType(file.name) === 'video') {
        // 视频族落库即 failed（P6），无需触发解析；刷新已呈现红态
        continue;
      }

      // 自动触发解析（同步执行，结果由轮询收敛；ADR-19）
      fetch(`/api/materials/${materialId}/parse`, { method: 'POST' }).catch(
        (): void => undefined,
      );
      const settled = await pollUntilSettled(gameId, materialId);
      if (!aliveRef.current) return;
      if (settled?.parseStatus === 'parsed') {
        toast('解析完成，游戏特点已更新');
        router.refresh(); // 特点卡（RSC 链头数据）随之刷新
      } else if (settled?.parseStatus === 'failed') {
        toast(`解析失败：${settled.parseError ?? '未知原因'}`);
      } else {
        toast('解析仍在进行，稍后可刷新查看结果');
      }
    }
  };

  const handleReanalyze = async () => {
    if (!activeGame) return;
    const gameId = activeGame.id;
    const list = await refreshMaterials(gameId);
    const targets = (list ?? []).filter(
      (m) => m.parseStatus === 'parsed' || m.parseStatus === 'failed',
    );
    if (targets.length === 0) {
      toast('暂无可重新分析的素材——请先上传');
      return;
    }
    toast('策略 Agent 正在重新分析全部素材…');
    await Promise.allSettled(
      targets.map((m) =>
        fetch(`/api/materials/${m.id}/parse`, { method: 'POST' }),
      ),
    );
    // 逐个等待收敛（并发解析已由服务端逐素材防重入保护）
    for (const m of targets) {
      await pollUntilSettled(gameId, m.id);
    }
    if (!aliveRef.current) return;
    toast('游戏特点已刷新');
    router.refresh();
  };

  return (
    <div className="mt-3">
      <PageHeader
        title="游戏知识"
        subtitle={
          <span className="block max-w-[76ch]">
            每个游戏的知识库由<b>你上传的素材</b>
            构成（设定集 / 美术 / 玩法文档 / 评测 / 数据）。策略 Agent 解析素材
            → 提炼游戏特点 → 喂给匹配、触达、合规各环节做决策。
          </span>
        }
      />
      {activeGame === null ? (
        // D2 空态：库内尚无游戏（不渲染假结构）
        <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          尚无游戏——请先在项目中创建游戏后再上传素材
        </p>
      ) : (
        <div className="mt-[22px] grid grid-cols-1 items-start gap-5 lg:grid-cols-[264px_minmax(0,1fr)]">
          <GameRail
            games={games}
            activeId={activeGame.id}
            materialCount={(id) =>
              (
                materialsByGame[id] ??
                findKnowledgeGame(games, id)?.materials ??
                []
              ).length
            }
            onSelect={selectGame}
          />
          <div className="min-w-0">
            <MaterialsCard
              game={activeGame}
              materials={materialsByGame[activeGame.id] ?? activeGame.materials}
              onUpload={handleUpload}
              onReanalyze={handleReanalyze}
            />
            <AnalysisCard game={activeGame} />
          </div>
        </div>
      )}
    </div>
  );
}
