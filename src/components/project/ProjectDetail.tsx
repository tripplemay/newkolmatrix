// AGENT-FOUNDATION F008 — 项目详情空间：五环节唯一容器（D22）
//
// 项目详情内以页内 tab 切换五环节（非路由，D22：五环节只存在于项目空间内部）；
// StagePanel 是环节唯一渲染入口。tab 切换同步 ?stage= query（供今天待办直达深链）。

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from 'components/card';
import PageHeader from 'components/common/PageHeader';
import StagePanel from './StagePanel';
import {
  STAGES,
  STAGE_LABEL,
  isStage,
  type Stage,
} from 'lib/agent/stage-routing';
import { getDemoProject } from './demo-projects';

export default function ProjectDetail({
  projectId,
  initialStage,
}: {
  projectId: string;
  initialStage?: string;
}) {
  const router = useRouter();
  const start: Stage =
    initialStage && isStage(initialStage) ? initialStage : 'brief';
  const [stage, setStage] = useState<Stage>(start);
  const project = getDemoProject(projectId);

  const selectStage = (s: Stage) => {
    setStage(s);
    // 同步 URL（非硬跳转，保持页内 tab 语义）；深链 ?stage= 支持今天待办直达。
    router.replace(`/admin/campaigns/${projectId}?stage=${s}`, {
      scroll: false,
    });
  };

  return (
    <div className="mt-3">
      <Card extra="!p-6">
        <PageHeader
          title={project?.name ?? projectId}
          subtitle={
            project
              ? `${project.cover} · 负责人 ${project.owner}（分工，非权限）`
              : '项目详情'
          }
          actions={
            <Link
              href="/admin/campaigns"
              className="text-sm font-medium text-brand-500 hover:underline"
            >
              ← 返回项目列表
            </Link>
          }
        />

        {/* 五环节 tab（页内，非路由，D22） */}
        <div className="mt-5 flex flex-wrap gap-2 border-b border-gray-200 dark:border-white/10">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStage(s)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                stage === s
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-400 hover:text-navy-700 dark:hover:text-white'
              }`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </Card>

      {/* stagePanel：环节唯一渲染入口 */}
      <StagePanel stage={stage} />
    </div>
  );
}
