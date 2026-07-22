// ARCH-M05 F014 → M1-D F004 接真 — 游戏知识页（V11，常驻策略 Agent）。
//
// RSC 直读（page-data.ts）：Game 全列 + Material 列表 + GameKnowledge 链头 →
// 可序列化 KnowledgeGameData[]（沿 ProjectDetailData 范式）。
// force-dynamic 硬要求（v1.0.9 §6）：本页无 dynamic API 依赖时 next build 会构建期
// 静态化——有 DB 则数据冻结成快照、无 DB（CI Build job）则 prisma 抛错硬红；
// 显式声明保证运行时逐请求读库（真直读，改→验→复原可证）。
// kbGame URL 化：?game= 经 searchParams 注入；非法/缺失由客户端回退首个游戏（D2 不抛错）。

import KnowledgeWorkbench from 'components/knowledge/KnowledgeWorkbench';
import { getKnowledgePageData } from 'lib/knowledge/page-data';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const games = await getKnowledgePageData();
  return <KnowledgeWorkbench games={games} initialGame={game} />;
}
