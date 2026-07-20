'use client';
// Layout components
import { usePathname } from 'next/navigation';
import { useContext, useState } from 'react';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';
import routes from 'routes';
import {
  getActiveNavbar,
  getActiveRoute,
  isWindowAvailable,
} from 'utils/navigation';
import React, { useEffect } from 'react';
import { Portal } from '@chakra-ui/portal';
import Navbar from 'components/navbar';
import Sidebar from 'components/sidebar';
import Footer from 'components/footer/Footer';
import { useMediaQuery } from 'hooks/useMediaQuery';
import CopilotPanel from 'components/copilot/CopilotPanel';

export default function Admin({ children }: { children: React.ReactNode }) {
  // states and functions
  const [fixed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();
  // DS-FOUNDATION F005：切到桌面断点（tailwind xl=1200px）时自动收起移动端抽屉。
  const isDesktop = useMediaQuery('(min-width: 1200px)');
  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);
  if (isWindowAvailable()) document.documentElement.dir = 'ltr';
  const context = useContext(ConfiguratorContext);
  const { mini, theme, setTheme, setMini } = context;
  return (
    <div className="flex h-full w-full bg-background-100 dark:bg-background-900">
      <Sidebar
        routes={routes}
        open={open}
        setOpen={() => setOpen(!open)}
        hovered={hovered}
        setHovered={setHovered}
        mini={mini}
        variant="admin"
      />
      {/* Navbar & Main Content */}
      <div className="h-full w-full font-dm dark:bg-navy-900">
        {/* Main Content */}
        <main
          className={`mx-2.5 flex-none transition-all dark:bg-navy-900 md:pr-2 xl:mr-[372px] ${
            mini === false
              ? 'xl:ml-[313px]'
              : mini === true && hovered === true
              ? 'xl:ml-[313px]'
              : 'ml-0 xl:ml-[142px]'
          } `}
        >
          {/* Routes */}
          <div>
            <Portal>
              <Navbar
                onOpenSidenav={() => setOpen(!open)}
                brandText={getActiveRoute(routes, pathname)}
                secondary={getActiveNavbar(routes, pathname)}
                theme={theme}
                setTheme={setTheme}
                hovered={hovered}
                mini={mini}
                setMini={setMini}
              />
            </Portal>
            <div className="mx-auto min-h-screen p-2 !pt-[100px] md:p-2">
              {children}
            </div>
            <div className="p-3">
              <Footer />
            </div>
          </div>
        </main>
      </div>
      {/* 常驻 Copilot 多 Agent 对话面（柱三+柱四，F007） */}
      <CopilotPanel />
    </div>
  );
}
