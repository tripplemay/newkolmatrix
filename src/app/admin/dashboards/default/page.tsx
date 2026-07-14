'use client';
import { useRouter } from 'next/navigation';
import {
  MdPersonSearch,
  MdCampaign,
  MdOutlineMail,
  MdTrendingUp,
} from 'react-icons/md';
import Card from 'components/card';
import MiniStatistics from 'components/card/MiniStatistics';
import LineChart from 'components/charts/LineChart';
import Button from 'components/common/Button';
import { lineChartOptionsOverallRevenue } from 'variables/charts';

// DS-FOUNDATION F006：KOLMatrix 占位 Dashboard —— 端到端验证外壳 + 基础组件 + 图表整栈打通。
// 占位数据；真实数据接口由后续业务批次接入。
const kolTrendData = [
  { name: '已发现 KOL', data: [120, 180, 240, 300, 380, 460] },
  { name: '已触达', data: [40, 70, 110, 150, 210, 280] },
];

const KPIS = [
  {
    name: '已发现 KOL',
    value: '1,284',
    icon: <MdPersonSearch className="h-7 w-7" />,
  },
  {
    name: '活跃 Campaign',
    value: '18',
    icon: <MdCampaign className="h-7 w-7" />,
  },
  {
    name: '触达率',
    value: '62%',
    icon: <MdOutlineMail className="h-7 w-7" />,
  },
  {
    name: '本月 ROI',
    value: '3.4x',
    icon: <MdTrendingUp className="h-7 w-7" />,
  },
];

export default function DefaultDashboard() {
  const router = useRouter();
  return (
    <div className="mt-3 flex flex-col gap-5">
      {/* KPI 行 */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <MiniStatistics
            key={k.name}
            name={k.name}
            value={k.value}
            icon={k.icon}
            iconBg="bg-lightPrimary dark:bg-navy-700"
          />
        ))}
      </div>

      {/* 趋势图 */}
      <Card extra="!p-[20px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-600">近 6 个月</p>
            <h2 className="text-xl font-bold text-navy-700 dark:text-white">
              KOL 发现与触达趋势
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/admin/discovery')}
          >
            去发现 →
          </Button>
        </div>
        <div className="mt-4 h-[320px] w-full">
          <LineChart
            chartData={kolTrendData}
            chartOptions={lineChartOptionsOverallRevenue}
          />
        </div>
      </Card>
    </div>
  );
}
