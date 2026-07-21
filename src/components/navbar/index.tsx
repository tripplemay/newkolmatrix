'use client';
// ARCH-M05 F003 — 三区外壳·玻璃 navbar 指令栏（fork 自 Horizon navbar，对照原型 S2 12 元素，L440-450）
// S2：①mobile menu 钮 ②面包屑 ③页标题 26px/800 ④🔒 nb-cmd 指令栏胶囊（替换搜索位，min-w 280）
//     ⑤spark 图标 ⑥placeholder（文案逐字原型）⑦「Agent 推进中」⑧🔒 pulse 绿点（纯 CSS）
//     ⑨主题切换（body.dark，不用 data-theme）⑩copilot toggle（mobile）⑪头像渐变圆 40 ⑫🔒 玻璃外壳
// 交互：指令栏 Enter → 内容送 Copilot 并自动打开面板（CopilotUiContext 桥接）。
// sticky 于主区流内（原型 .navbar sticky top:12）——路由切换不重挂载（layout 持久）。

import { useState } from 'react';
import { FiAlignJustify } from 'react-icons/fi';
import { MdAutoAwesome, MdDarkMode, MdLightMode } from 'react-icons/md';
import useColorMode from 'hooks/useColorMode';
import { useCopilotUi } from 'contexts/CopilotUiContext';

const CMD_PLACEHOLDER = '问 Campaign Agent 或下达任务…';

const NB_ICO =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-gray-600 transition hover:text-brand-500 dark:bg-navy-800 dark:text-white dark:hover:text-brand-400';

const Navbar = (props: {
  onOpenSidenav: () => void;
  /** 面包屑（S2-2，如「工作台」/「工作台 / 项目」） */
  breadcrumb?: string;
  /** 页标题（S2-3） */
  brandText: string;
  [x: string]: any;
}) => {
  const { onOpenSidenav, breadcrumb = '工作台', brandText } = props;
  // DS-FOUNDATION F005：统一走 useColorMode（body.dark，S2-9 不用 data-theme）。
  const { isDark, toggle } = useColorMode();
  const { dispatchCommand, toggleDrawer } = useCopilotUi();
  const [cmd, setCmd] = useState('');

  const submitCmd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = cmd.trim();
    if (!t) return;
    // S2 交互：Enter → 送 Copilot 并自动打开面板（移动端抽屉）
    dispatchCommand(t);
    setCmd('');
  };

  return (
    // S2-12 🔒 玻璃外壳：sticky + backdrop-blur-xl + 30% 白
    <nav className="sticky top-3 z-20 mb-1.5 mt-3.5 flex items-center gap-4 rounded-xl bg-white/30 px-4 py-3 backdrop-blur-xl dark:bg-navyGlass">
      {/* S2-1 mobile menu */}
      <button
        type="button"
        onClick={onOpenSidenav}
        aria-label="导航"
        className={`${NB_ICO} xl:hidden`}
      >
        <FiAlignJustify className="h-5 w-5" />
      </button>

      {/* S2-2/3 面包屑 + 页标题 */}
      <div className="min-w-0">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {breadcrumb}
        </div>
        <div className="mt-0.5 truncate text-[26px] font-extrabold leading-tight tracking-tight text-navy-700 dark:text-white">
          {brandText}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {/* S2-4/5/6 🔒 指令栏胶囊（替换搜索位）：spark + placeholder 原文 */}
        <form
          onSubmit={submitCmd}
          className="hidden min-w-[280px] items-center gap-2 rounded-full bg-lightPrimary px-4 py-2.5 dark:bg-navy-900 md:flex"
        >
          <MdAutoAwesome className="h-4 w-4 shrink-0 text-brand-500" />
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder={CMD_PLACEHOLDER}
            aria-label="向 Agent 下达任务"
            className="w-full bg-transparent text-compact font-medium text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
          />
        </form>

        {/* S2-7/8 「Agent 推进中」+ 🔒 pulse 绿点（纯 CSS） */}
        <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-600 dark:text-gray-400 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Agent 推进中
        </span>

        {/* S2-9 主题切换（body.dark） */}
        <button
          type="button"
          onClick={toggle}
          aria-label="切换深浅色"
          className={NB_ICO}
        >
          {isDark ? (
            <MdLightMode className="h-5 w-5" />
          ) : (
            <MdDarkMode className="h-5 w-5" />
          )}
        </button>

        {/* S2-10 copilot toggle（mobile） */}
        <button
          type="button"
          onClick={toggleDrawer}
          aria-label="打开 Agent"
          className={`${NB_ICO} xl:hidden`}
        >
          <MdAutoAwesome className="h-5 w-5" />
        </button>

        {/* S2-11 头像渐变圆 40px */}
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brandLinear to-brand-500 text-compact font-bold text-white">
          MC
        </span>
      </div>
    </nav>
  );
};

export default Navbar;
