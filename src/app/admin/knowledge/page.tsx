// ARCH-M05 F014 — 游戏知识页（V11，常驻策略 Agent），替换 AGENT-FOUNDATION F008 ComingSoon 外壳。
// kbGame URL 化：?game= 经 searchParams 注入（裁决 #4 / D7，沿 campaigns ?stage= 先例）；
// 非法 / 缺失值由客户端回退首个游戏（D2 不抛错）。
import KnowledgeWorkbench from 'components/knowledge/KnowledgeWorkbench';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  return <KnowledgeWorkbench initialGame={game} />;
}
