// ARCH-M05 F007 — Insight 环节落地面占位 stub（挂载契约：default export + { projectId }）。
// F012 实装「对照账本」语法面（V8 19 元素）时整体替换本文件；五套语法互不相同（D8/FR-7.10）。

import Badge from 'components/common/Badge';
import SurfaceCard from 'components/common/SurfaceCard';
import { ENV_META } from 'components/project/env-meta';

export default function InsightEnv({ projectId }: { projectId: string }) {
  const meta = ENV_META.insight;
  return (
    <SurfaceCard className="p-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-navy-700 dark:text-white">
          {meta.name}
        </span>
        <Badge>{meta.grammar}</Badge>
      </div>
      <div className="mt-4 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10">
        {meta.grammar} 落地面 · F008-F012 实装中
        <div className="mt-1 text-micro text-gray-400">项目 {projectId}</div>
      </div>
    </SurfaceCard>
  );
}
