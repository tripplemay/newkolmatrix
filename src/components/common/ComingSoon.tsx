'use client';
import { useRouter } from 'next/navigation';
import Card from 'components/card';
import Button from 'components/common/Button';
import PageHeader from 'components/common/PageHeader';

// DS-FOUNDATION F003：占位模块页的共用外观。业务批次会用真实内容替换对应 page。
// FE-REFACTOR F002：头部收敛为 PageHeader（副标题间距 mt-2→mt-1、gray-600→gray-500 归一 canonical，F005 统一回 gray-600）。
export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const router = useRouter();
  return (
    <div className="mt-3 grid grid-cols-1 gap-5">
      <Card extra="!p-[24px] flex min-h-[260px] items-center justify-center">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
            KOLMatrix
          </p>
          <PageHeader
            className="mt-2"
            align="center"
            title={title}
            subtitle={description || 'Coming soon'}
          />
          <div className="mt-6 flex justify-center">
            {/* ARCH-M05 F002：重指 IA 收敛后的真实首页（原 /admin/dashboards/default 已为 redirect 桩） */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/admin/today')}
            >
              ← 返回「今天」
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
