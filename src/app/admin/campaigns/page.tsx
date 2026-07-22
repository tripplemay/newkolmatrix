// ARCH-M05 F007 — 项目列表（V2 全 10 元素，原型 viewCampaigns L738-744）
//
// 标题 + 🔒 lede IA 契约句（「…这一层只做进入」）+ 卡 ×4（avatar 色轮 / 全名 /
// market·budget·health 三 pill）+ goal 句 + rc-foot「停在「{环节}」」+「进入」钮。
// 卡片只做「进入」——真正的触达/谈判/审核/放款都在项目内部；「进入」直落项目
// 当前推进环节（stageHref 产出 ?env=，原型 data-goenv=p.cur 语义）。

'use client';

import { useRouter } from 'next/navigation';
import { MdChevronRight } from 'react-icons/md';
import Card from 'components/card';
import Button from 'components/common/Button';
import PageHeader from 'components/common/PageHeader';
import ProjectAvatar from 'components/project/ProjectAvatar';
import { ENV_META } from 'components/project/env-meta';
import { stageHref } from 'lib/agent/stage-routing';
import { mockProjects } from 'lib/data/mock/projects';
import type { HealthBand } from 'lib/domain/health';
import { HEALTH_LABEL } from 'lib/display/health-label';

/** 原型 .pill 四色调（nu 中性 + 健康度三态 gd/wn/cr，不得压成二态） */
const PILL_TONE: Record<'nu' | HealthBand, string> = {
  nu: 'bg-lightPrimary text-gray-600 dark:bg-navy-700 dark:text-gray-400',
  gd: 'bg-green-50 text-green-600',
  wn: 'bg-orange-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
  cr: 'bg-red-50 text-red-500',
};

function Pill({
  tone,
  children,
}: {
  tone: 'nu' | HealthBand;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-micro font-bold ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  return (
    <div className="mt-3">
      {/* V2-1 标题 + V2-2 🔒 lede IA 契约句（文案逐字原型 L739） */}
      <PageHeader
        className="mb-5"
        title="项目"
        subtitle="选择一个项目进入完整上下文。真正的触达、谈判、审核与放款都在项目内部——这一层只做进入。"
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {mockProjects.map((p, pi) => {
          const env = ENV_META[p.cur];
          const EnvIcon = env.icon;
          return (
            // V2-3 卡 ×4（原型 .rcard：avatar / 全名 / 三 pill / goal / rc-foot / 进入）
            <Card key={p.id} extra="!p-[22px] flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                {/* V2-3a avatar 色轮（游戏名首二字 + 6 色轮） */}
                <ProjectAvatar label={p.game} index={pi} size={42} />
                <div className="min-w-0">
                  {/* V2-4 项目全名 */}
                  <b className="block text-[15px] font-bold text-navy-700 dark:text-white">
                    {p.name}
                  </b>
                  {/* V2-5/6/7 market pill + budget pill + health pill 三态 */}
                  <div className="mt-[5px] flex flex-wrap gap-1.5">
                    <Pill tone="nu">{p.market}</Pill>
                    <Pill tone="nu">{p.budget}</Pill>
                    <Pill tone={p.health}>{HEALTH_LABEL[p.health]}</Pill>
                  </div>
                </div>
              </div>
              {/* V2-8 goal 句 */}
              <p className="text-compact text-gray-600 dark:text-gray-400">
                {p.goal}
              </p>
              {/* V2-9 rc-foot「停在「{环节}」」 + V2-10「进入」钮 */}
              <div className="mt-auto flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <EnvIcon size={14} />
                  停在「{env.name}」
                </span>
                <span className="flex-1" />
                <Button
                  size="sm"
                  variant="solid"
                  rightIcon={<MdChevronRight size={16} />}
                  onClick={() => router.push(stageHref(p.id, p.cur))}
                >
                  进入
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
