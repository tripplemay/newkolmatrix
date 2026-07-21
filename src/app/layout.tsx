import React, { ReactNode } from 'react';
import type { Metadata } from 'next';
import AppWrappers from './AppWrappers';
// import '@asseinfo/react-kanban/dist/styles.css';
// import '/public/styles/Plugins.css';

// DS-FOUNDATION F003：App Router 元数据（title/description）。
// 取代模板遗留的 app/head.tsx（Next 15 App Router 已忽略 head.tsx）。
export const metadata: Metadata = {
  title: 'KOLMatrix',
  description: 'AI 驱动的 KOL 营销管理平台',
  manifest: '/manifest.json',
};

// P2-CLEANUP F002（BL-FE-12）— 深色模式 pre-paint 还原脚本。
// 必须是 <body> 首子节点：解析到此处时 document.body 已存在，且早于任何绘制，
// 因此刷新时不会先闪一帧浅色再转深色。键名/取值与 hooks/useColorMode 同一契约（spec D1）。
// 只认字面量 'dark'——缺省 / 损坏值 / localStorage 不可用一律留在浅色默认态。
const COLOR_MODE_BOOTSTRAP = `try{if(localStorage.getItem('kolmatrix.colorMode')==='dark'){document.body.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* DS-FOUNDATION F002: 浅色为默认（去除模板原本的 className="dark"）。
          深色由 navbar 的主题切换钮经 hooks/useColorMode 向 body 追加 "dark" class，
          并持久化到 localStorage，由下面的 pre-paint 脚本在刷新时还原。 */}
      <body id={'root'}>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOTSTRAP }} />
        <AppWrappers>{children}</AppWrappers>
      </body>
    </html>
  );
}
