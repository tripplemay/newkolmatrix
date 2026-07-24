'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  COLOR_MODE_STORAGE_KEY,
  colorModeStore,
} from './color-mode-store';

/**
 * 统一的浅/深色模式 hook（DS-FOUNDATION F005）。
 * 收敛模板中重复的 `document.body.classList('dark')` 逻辑（navbar / Configurator / FixedPlugin）。
 * Tailwind darkMode: 'class' —— 深色 = body 上有 `dark` class。
 *
 * P2-CLEANUP F002（BL-FE-12）：增 localStorage 持久层。
 * 唯一状态源仍是 `body.dark`（spec D2），localStorage 只是它的持久化投影：
 * 写在 setDark/toggle，读在挂载 + `layout.tsx` 的 pre-paint 内联脚本（消除刷新闪烁）。
 * 全站 NoSSR(ssr:false) 无 SSR 首屏，故不走 cookie/SSR 方案（spec D1）。
 *
 * M3-B F012（BL-FE-16，P11）：**跨实例 / 跨标签页同步**。
 * 改造前每个调用点各持一份 useState，纯读取方在活体切换时收不到通知；
 * 现改为 `useSyncExternalStore` 订阅模块级 store（hooks/color-mode-store.ts）——
 * 一处 toggle，所有消费者同步；别的标签页切换经 storage 事件同步过来。
 * **对外 API 完全不变**（{ isDark, setDark, toggle }），既有调用点行为不变。
 */

export { COLOR_MODE_STORAGE_KEY };

export function useColorMode() {
  const isDark = useSyncExternalStore(
    colorModeStore.subscribe,
    colorModeStore.getSnapshot,
    colorModeStore.getServerSnapshot,
  );

  // 挂载后把持久值同步到真相源（pre-paint 脚本已置过，此处幂等）；
  // 无持久值则保持现状 —— 保持改造前行为，默认浅色。
  useEffect(() => {
    colorModeStore.syncFromStorage();
  }, []);

  const setDark = useCallback((dark: boolean) => {
    colorModeStore.setDark(dark);
  }, []);

  const toggle = useCallback(() => {
    colorModeStore.toggle();
  }, []);

  return { isDark, setDark, toggle };
}

export default useColorMode;
