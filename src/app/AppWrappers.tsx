'use client';
import React, { ReactNode } from 'react';
import 'styles/App.css';
import 'styles/Contact.css';
// import '@asseinfo/react-kanban/dist/styles.css';
// import 'styles/Plugins.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';

import { useState } from 'react';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';
// ARCH-M05 F005：全局单例 Toast（裁决 #9 自建轻量，挂 app 根）
import { ToastProvider } from 'components/common/Toast';

// M1-A-BRIEF F002 — 此处原本包了一层 `dynamic(..., { ssr: false })`（模板遗留的 NoSSR），
// 使整棵树在服务端完全不渲染、全站无 SSR 首屏。D3 裁决的 RSC 直读通道因此零收益，故拆除。
// 拆除后本组件仍是 'use client'（它持有 Configurator 的 useState），
// 但会正常参与服务端渲染，children 中的 RSC 也才真正生效。

export default function AppWrappers({ children }: { children: ReactNode }) {
  const [mini, setMini] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [theme, setTheme] = useState<any>({
    '--background-100': '#FFFFFF',
    '--background-900': '#070f2e',
    '--shadow-100': 'rgba(112, 144, 176, 0.08)',
    '--color-50': '#E9E3FF',
    '--color-100': '#C0B8FE',
    '--color-200': '#A195FD',
    '--color-300': '#8171FC',
    '--color-400': '#7551FF',
    '--color-500': '#422AFB',
    '--color-600': '#3311DB',
    '--color-700': '#2111A5',
    '--color-800': '#190793',
    '--color-900': '#11047A',
  });
  // 运行时换肤：theme state 变化时覆写 documentElement 上的同名变量。
  // 首屏默认值不再依赖本 effect —— 同一组取值已落在 styles/index.css 的 :root，
  // 否则 SSR 首帧（effect 尚未运行）会把 `var(--color-500)` 解析成未定义值。
  React.useEffect(() => {
    let color;
    for (color in theme) {
      document.documentElement.style.setProperty(color, theme[color]);
    }
    //eslint-disable-next-line
  }, [theme]);
  return (
    <ConfiguratorContext.Provider
      value={{
        mini,
        setMini,
        theme,
        setTheme,
        hovered,
        setHovered,
        contrast,
        setContrast,
      }}
    >
      <ToastProvider>{children}</ToastProvider>
    </ConfiguratorContext.Provider>
  );
}
