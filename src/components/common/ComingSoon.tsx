'use client';
import Card from 'components/card';

// DS-FOUNDATION F003：占位模块页的共用外观。业务批次会用真实内容替换对应 page。
export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-5">
      <Card extra="!p-[24px] flex min-h-[260px] items-center justify-center">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
            KOLMatrix
          </p>
          <h1 className="mt-2 text-2xl font-bold text-navy-700 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {description || 'Coming soon'}
          </p>
        </div>
      </Card>
    </div>
  );
}
