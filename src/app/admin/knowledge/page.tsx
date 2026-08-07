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
import { withSessionTenant } from 'lib/db/tenant-entry';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  // M5-AUTH-RLS F004（spec D-3）：租户来自登录会话。
  // M5.1b-TENANT-INJECTION F005（spec D-6 最小闭环）：本页是 **RSC 执行上下文**的 ALS 传播样板。
  //
  // 【只包数据装配，不包渲染】作用域止于 getKnowledgePageData —— 它把这一页要的行**全部读完**
  // 才返回可序列化数据（page-contract.ts 的 KnowledgeGameData[]），JSX 里不再有数据访问。
  // 把 return 的 JSX 一起包进来只会让一条 DB 连接陪着整段渲染（含下游组件树构造）白等，
  // 而多拿不到任何一次查询；RSC 若哪天改成在 JSX 内 await（Suspense 流式子树），
  // 那次访问会落在作用域外 → 开关开时当场 MissingTenantScopeError，不会静默读错租户。
  const games = await withSessionTenant(({ tenantId }) =>
    getKnowledgePageData({ tenantId }),
  );
  return <KnowledgeWorkbench games={games} initialGame={game} />;
}
