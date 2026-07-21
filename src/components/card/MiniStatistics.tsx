import React from 'react';
function MiniStatistics(props: {
  name: string;
  values?: string;
  icon: JSX.Element;
  value: React.ReactNode;
  iconBg: string;
  /** ARCH-M05 F006 — KPI 涨幅位（原型 .k-val small，绿色）。可选：无 delta 的 KPI 不渲染该位（V1 两态不得统一）。 */
  delta?: string;
}) {
  const { name, value, icon, iconBg, delta } = props;
  return (
    <div className="flex w-full items-center gap-3 rounded-[20px] bg-white bg-clip-border px-[18px] py-4 shadow-3xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none">
      <div
        className={`flex h-[56px] w-14 items-center justify-center rounded-full text-[33px] text-brand-500 dark:!bg-navy-700 dark:text-white ${iconBg} `}
      >
        {icon}
      </div>
      <div className="">
        <p className=" mb-1 text-sm font-medium text-gray-600">{name}</p>
        <h3 className="text-xl font-bold leading-6 text-navy-700 dark:text-white">
          {value}
          {delta != null && (
            <small className="ml-1.5 text-xs font-bold text-green-500 dark:text-green-400">
              {delta}
            </small>
          )}
        </h3>
      </div>
    </div>
  );
}

export default MiniStatistics;
