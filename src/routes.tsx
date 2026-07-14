import {
  MdHome,
  MdPersonSearch,
  MdStorage,
  MdCampaign,
  MdOutlineMail,
} from 'react-icons/md';
import { IRoute } from 'types/navigation';

// KOLMatrix 最小 IA（DS-FOUNDATION F003）
// Dashboard 已实装占位（F001/F006）；Discovery / Database / Campaigns / Outreach 为占位页
// （Coming soon，非幽灵项：点击会导航到真实占位页），由后续业务批次填充。
const routes: IRoute[] = [
  {
    name: 'Dashboard',
    layout: '/admin',
    path: '/dashboards/default',
    icon: <MdHome className="text-inherit h-5 w-5" />,
  },
  {
    name: 'Discovery',
    layout: '/admin',
    path: '/discovery',
    icon: <MdPersonSearch className="text-inherit h-5 w-5" />,
  },
  {
    name: 'Database',
    layout: '/admin',
    path: '/database',
    icon: <MdStorage className="text-inherit h-5 w-5" />,
  },
  {
    name: 'Campaigns',
    layout: '/admin',
    path: '/campaigns',
    icon: <MdCampaign className="text-inherit h-5 w-5" />,
  },
  {
    name: 'Outreach',
    layout: '/admin',
    path: '/outreach',
    icon: <MdOutlineMail className="text-inherit h-5 w-5" />,
  },
];

export default routes;
