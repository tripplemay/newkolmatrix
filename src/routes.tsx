import {
  MdOutlineToday,
  MdCampaign,
  MdPersonSearch,
  MdVideogameAsset,
  MdInsights,
  MdHistory,
} from 'react-icons/md';
import { IRoute } from 'types/navigation';

// AGENT-FOUNDATION F008 — IA 侧栏 6 项（用户 2026-07-20 裁决按 PRD §7 / 落地规范 §3）。
// 项目详情（/admin/campaigns/[id]）不进侧栏，由项目列表卡 router.push 进入；
// 五环节（Brief/Match/Reach/Delivery/Insight）只在项目详情空间内部（页内 tab，非路由，D22）。
const routes: IRoute[] = [
  {
    name: '今天',
    layout: '/admin',
    path: '/today',
    icon: <MdOutlineToday className="text-inherit h-5 w-5" />,
  },
  {
    name: '项目',
    layout: '/admin',
    path: '/campaigns',
    icon: <MdCampaign className="text-inherit h-5 w-5" />,
  },
  {
    name: '创作者库',
    layout: '/admin',
    path: '/creators',
    icon: <MdPersonSearch className="text-inherit h-5 w-5" />,
  },
  {
    name: '游戏知识',
    layout: '/admin',
    path: '/knowledge',
    icon: <MdVideogameAsset className="text-inherit h-5 w-5" />,
  },
  {
    name: '洞察',
    layout: '/admin',
    path: '/insight',
    icon: <MdInsights className="text-inherit h-5 w-5" />,
  },
  {
    name: 'Agent 记录',
    layout: '/admin',
    path: '/runs',
    icon: <MdHistory className="text-inherit h-5 w-5" />,
  },
];

export default routes;
