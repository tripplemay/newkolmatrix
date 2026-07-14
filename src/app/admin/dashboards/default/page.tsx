'use client';
import Card from 'components/card';

// DS-FOUNDATION F001 占位页 — 仅用于验证 scaffold 与外壳可渲染。
// 真正的 KOLMatrix Dashboard 由 F006 实装（KPI 卡 + ApexChart）。
export default function DefaultDashboard() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-5">
      <Card extra="!p-[20px]">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
          KOLMatrix
        </h1>
        <p className="mt-1 text-base text-gray-600">
          AI 驱动的 KOL 营销管理平台 — 设计系统地基已就绪。
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Scaffold placeholder (DS-FOUNDATION F001). Dashboard content lands in F006.
        </p>
      </Card>
    </div>
  );
}
