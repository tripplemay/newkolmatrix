'use client';
// ARCH-M05 F003 — 三区外壳·侧栏（fork 自 Horizon sidebar，对照原型 S1 12 元素，L432-437 / CSS L46-66）
// S1：①KM 渐变方块 mark ②品牌双字重 KOL(800)+Matrix(300) ③分隔线 ④组标签「工作台」
//     ⑤6 入口（routes.tsx 驱动）⑥🔒 active 右侧 4×36 竖条 ⑦🔒 待办数字徽标（M2-A F008 接真）
//     ⑧.side-cta 渐变卡 ⑨🔒 orb 装饰半圆 ⑩shield 圆图标 44 ⑪🔒 标题「Agent 自动边界」⑫🔒 D26/D27 宣示文案
// 固定 285px（kimi §6.2）；移除模板 mini/hover 折叠（三区外壳固定三列）；移动端保持抽屉开合。
//
// M2-A F008 — 徽标接真（U4）：GET /api/nav-badges 真计数（today=待办 pending /
// 项目=Project 计数），client fetch on mount + 路由变化 revalidate；计数 0 → 隐藏；
// fetch 失败 → 全隐藏不抛错（D2 诚实降级）；洞察徽标退役（无真源不显假数，恢复归 M4）。

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HiX } from 'react-icons/hi';
import { MdShield } from 'react-icons/md';
import Card from 'components/card';
import NavLink from 'components/link/NavLink';
import Badge from 'components/common/Badge';
import { IRoute } from 'types/navigation';

interface NavBadges {
  today: number;
  projects: number;
}

/** 徽标真值 → 各入口的映射（洞察不映射 = 徽标退役）。0 / 无值 → null 隐藏。 */
function badgeFor(badges: NavBadges | null, path: string): number | null {
  if (badges == null) return null;
  if (path === '/today') return badges.today > 0 ? badges.today : null;
  if (path === '/campaigns')
    return badges.projects > 0 ? badges.projects : null;
  return null;
}

function SidebarHorizon(props: {
  routes: IRoute[];
  open: boolean;
  setOpen: (open: boolean) => void;
  variant?: string;
  [x: string]: any;
}) {
  const { routes, open, setOpen, variant } = props;
  const pathname = usePathname();

  // F008：徽标真计数——mount + 路由变化 revalidate；失败保持 null/旧值（徽标隐藏/沿用），
  // 绝不抛错打断侧栏渲染（D2）。
  const [badges, setBadges] = useState<NavBadges | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/nav-badges')
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then((data) => {
        if (cancelled || data == null || typeof data !== 'object') return;
        const d = data as { today?: unknown; projects?: unknown };
        setBadges({
          today: typeof d.today === 'number' ? d.today : 0,
          projects: typeof d.projects === 'number' ? d.projects : 0,
        });
      })
      .catch(() => {
        // D2：fetch 失败 → 徽标全隐藏（badges 保持 null）/ 沿用上次值，不抛错
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div
      className={`sm:none duration-175 linear fixed !z-50 min-h-full w-[285px] transition-all md:!z-50 lg:!z-50 xl:!z-0 ${
        variant === 'auth' ? 'xl:hidden' : 'xl:block'
      } ${open ? '' : '-translate-x-[110%] xl:translate-x-[unset]'}`}
    >
      <Card
        extra={`m-7 ml-3 h-[96.5vh] w-full overflow-hidden !rounded-[20px] pb-5 sm:my-4 sm:mr-4`}
      >
        {/* mobile close */}
        <span
          className="absolute right-4 top-4 z-10 block cursor-pointer xl:hidden"
          onClick={() => setOpen(false)}
        >
          <HiX />
        </span>

        {/* S1-1/2 品牌区：KM mark + 双字重品牌字 */}
        <div className="flex items-center gap-3 px-7 pb-6 pt-8">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brandLinear to-brand-500 text-compact font-extrabold text-white">
            KM
          </span>
          <div className="font-poppins text-[22px] tracking-tight text-navy-700 dark:text-white">
            <span className="font-extrabold">KOL</span>
            <span className="font-light">Matrix</span>
          </div>
        </div>

        {/* S1-3 分隔线 */}
        <div className="mx-5 mb-3 h-px bg-gray-200 dark:bg-white/10" />

        {/* S1-4/5/6/7 导航：组标签 + 6 入口 + active 竖条 + 待办徽标 */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-4">
          <div className="px-3.5 pb-2 pt-3 text-mini font-bold uppercase tracking-wider text-gray-400">
            工作台
          </div>
          {routes.map((route) => {
            const href = `${route.layout}${route.path}`;
            const active = pathname?.startsWith(href) ?? false;
            const badge = badgeFor(badges, route.path ?? '');
            return (
              <NavLink key={route.path} href={href}>
                <div className="relative flex cursor-pointer items-center gap-3.5 px-3.5 py-2.5">
                  <span
                    className={
                      active
                        ? 'text-brand-500 dark:text-white'
                        : 'text-gray-400'
                    }
                  >
                    {route.icon}
                  </span>
                  <span
                    className={`text-[15px] ${
                      active
                        ? 'font-bold text-navy-700 dark:text-white'
                        : 'font-medium text-gray-600'
                    }`}
                  >
                    {route.name}
                  </span>
                  {badge != null && (
                    <Badge
                      variant="solid"
                      shape="pill"
                      size="xs"
                      className="ml-auto min-w-[22px] text-center !text-micro"
                    >
                      {badge}
                    </Badge>
                  )}
                  {/* S1-6 🔒 active 右侧 4×36 圆角竖条 */}
                  {active && (
                    <span className="absolute right-0 top-1/2 h-9 w-1 -translate-y-1/2 rounded-lg bg-brand-500 dark:bg-brand-400" />
                  )}
                </div>
              </NavLink>
            );
          })}
        </nav>

        {/* S1-8~12 🔒 side-cta：Agent 自动边界渐变卡（常驻不可关闭，D26/D27 宣示） */}
        <div className="relative mx-5 mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brandLinear to-brand-500 px-5 pb-5 text-center text-white">
          {/* S1-9 🔒 orb 装饰半圆 */}
          <div className="absolute -top-14 left-1/2 h-[130px] w-[130px] -translate-x-1/2 rounded-full bg-white/[0.12]" />
          {/* S1-10 shield 圆图标 44px */}
          <div className="relative mx-auto mb-3 mt-6 grid h-11 w-11 place-items-center rounded-full bg-white/20">
            <MdShield size={20} />
          </div>
          {/* S1-11 🔒 标题 */}
          <b className="relative block text-[15px] font-bold">Agent 自动边界</b>
          {/* S1-12 🔒 说明（文案逐字原型 L436） */}
          <p className="relative mt-1.5 text-micro leading-relaxed text-white/85">
            可检索 · 评估 · 匹配 · 起草。发送 / 报价 / 放款 /
            分享一律停在你面前。
          </p>
        </div>
      </Card>
    </div>
  );
}

export default SidebarHorizon;
