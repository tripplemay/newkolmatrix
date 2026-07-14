'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * 统一的浅/深色模式 hook（DS-FOUNDATION F005）。
 * 收敛模板中重复的 `document.body.classList('dark')` 逻辑（navbar / Configurator / FixedPlugin）。
 * Tailwind darkMode: 'class' —— 深色 = body 上有 `dark` class。
 */
export function useColorMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // 客户端挂载后同步真实状态，避免 SSR/首屏不一致
    setIsDark(document.body.classList.contains('dark'));
  }, []);

  const setDark = useCallback((dark: boolean) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark', dark);
    setIsDark(dark);
  }, []);

  const toggle = useCallback(() => {
    if (typeof document === 'undefined') return;
    setDark(!document.body.classList.contains('dark'));
  }, [setDark]);

  return { isDark, setDark, toggle };
}

export default useColorMode;
