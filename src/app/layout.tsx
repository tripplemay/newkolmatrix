import React, { ReactNode } from 'react';
import AppWrappers from './AppWrappers';
// import '@asseinfo/react-kanban/dist/styles.css';
// import '/public/styles/Plugins.css';

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
