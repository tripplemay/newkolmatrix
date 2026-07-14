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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* DS-FOUNDATION F002: 浅色为默认（去除模板原本的 className="dark"）。
          深色仍可用：navbar Configurator / FixedPlugin 的 toggle 会向 body 追加 "dark" class。 */}
      <body id={'root'}>
        <AppWrappers>{children}</AppWrappers>
      </body>
    </html>
  );
}
