// AGENT-FOUNDATION F008 — 项目详情路由（五环节唯一容器，不进侧栏）
import ProjectDetail from 'components/project/ProjectDetail';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage } = await searchParams;
  return <ProjectDetail projectId={id} initialStage={stage} />;
}
