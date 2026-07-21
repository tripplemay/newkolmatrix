'use client';
// ARCH-M05 F003 — 三区外壳（kimi §6.2）：侧栏 285px 固定 + 主区弹性（sticky 玻璃 navbar 内嵌指令栏）
// + Copilot 360px 常驻（xl 以下退为 fixed 右滑抽屉）。
// 不重挂载（FR-7.1）：Sidebar / Navbar / CopilotPanel 挂在本 layout——App Router 布局跨路由持久，
// 路由切换只重绘 children（主区）与 Copilot 上下文（contextKey remount），外壳组件不 remount。
// CopilotUiProvider：navbar 指令栏 / cop-toggle ⇄ Copilot 面板的轻量通信桥（ADR-18 不引全局 store）。

import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import routes from 'routes';
import { getActiveRoute } from 'utils/navigation';
import Navbar from 'components/navbar';
import Sidebar from 'components/sidebar';
import Footer from 'components/footer/Footer';
import { useMediaQuery } from 'hooks/useMediaQuery';
import CopilotPanel from 'components/copilot/CopilotPanel';
import { CopilotUiProvider } from 'contexts/CopilotUiContext';

export default function Admin({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // DS-FOUNDATION F005：切到桌面断点（tailwind xl=1200px）时自动收起移动端侧栏抽屉。
  const isDesktop = useMediaQuery('(min-width: 1200px)');
  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);

  // S2-2 面包屑：项目详情为「工作台 / 项目」（游戏名细化归 F007 详情外壳）
  const isProjectDetail = /^\/admin\/campaigns\/[^/]+/.test(pathname ?? '');
  const breadcrumb = isProjectDetail ? '工作台 / 项目' : '工作台';

  return (
    <CopilotUiProvider>
      <div className="flex h-full w-full bg-background-100 dark:bg-background-900">
        {/* 三区之一：侧栏 285px（6 入口 + Agent 自动边界 CTA 常驻不可关闭） */}
        <Sidebar
          routes={routes}
          open={open}
          setOpen={setOpen}
          variant="admin"
        />
        {/* 三区之二：主区弹性（sticky 玻璃 navbar + 落地画布） */}
        <div className="h-full w-full font-dm dark:bg-navy-900">
          <main className="mx-2.5 flex-none transition-all dark:bg-navy-900 md:pr-2 xl:ml-[313px] xl:mr-[372px]">
            <Navbar
              onOpenSidenav={() => setOpen(!open)}
              breadcrumb={breadcrumb}
              brandText={getActiveRoute(routes, pathname)}
            />
            <div className="mx-auto min-h-screen p-2 !pt-3 md:p-2">
              {children}
            </div>
            <div className="p-3">
              <Footer />
            </div>
          </main>
        </div>
        {/* 三区之三：常驻 Copilot 多 Agent 对话面（柱三+柱四；移动端 fixed 右滑抽屉） */}
        <CopilotPanel />
      </div>
    </CopilotUiProvider>
  );
}
