// ARCH-M05 F007 — 项目详情路由（D22：五环节页内 tab 非路由，不进侧栏）
// URL 态 ?env=（kimi §6.1）；旧深链 ?stage= 由 ProjectDetail 兼容重写为 ?env=。
import ProjectDetail from 'components/project/ProjectDetail';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ env?: string; stage?: string }>;
}) {
  const { id } = await params;
  const { env, stage } = await searchParams;
  return <ProjectDetail projectId={id} initialEnv={env} legacyStage={stage} />;
}
