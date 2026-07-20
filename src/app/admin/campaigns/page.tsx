// AGENT-FOUNDATION F008 — 项目列表（侧栏「项目」入口）
'use client';

import Link from 'next/link';
import Card from 'components/card';
import Badge from 'components/common/Badge';
import { MdArrowForward } from 'react-icons/md';
import { DEMO_PROJECTS } from 'components/project/demo-projects';

export default function CampaignsPage() {
  return (
    <div className="mt-3">
      <h1 className="mb-1 text-2xl font-bold text-navy-700 dark:text-white">
        项目
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        每个项目是五环节（Brief · Match · Reach · Delivery ·
        Insight）的唯一容器。点开进入项目空间。
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEMO_PROJECTS.map((p) => (
          <Link key={p.id} href={`/admin/campaigns/${p.id}`}>
            <Card extra="!p-5 h-full transition hover:shadow-xl">
              <div className="flex items-center justify-between">
                {/* FE-REFACTOR F001：收敛为 Badge canonical 形态（修复 px-2/text-[11px] 尺寸漂移） */}
                <Badge>{p.cover}</Badge>
                <MdArrowForward className="text-gray-300" />
              </div>
              <h3 className="mt-3 text-lg font-bold text-navy-700 dark:text-white">
                {p.name}
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                负责人 {p.owner}（分工，非权限）
              </p>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                {p.progress}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
