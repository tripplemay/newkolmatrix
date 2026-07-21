'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * 统一的浅/深色模式 hook（DS-FOUNDATION F005）。
 * 收敛模板中重复的 `document.body.classList('dark')` 逻辑（navbar / Configurator / FixedPlugin）。
 * Tailwind darkMode: 'class' —— 深色 = body 上有 `dark` class。
 *
 * P2-CLEANUP F002（BL-FE-12）：增 localStorage 持久层。
 * 唯一状态源仍是 `body.dark`（spec D2），localStorage 只是它的持久化投影：
 * 写在 setDark/toggle，读在挂载 + `layout.tsx` 的 pre-paint 内联脚本（消除刷新闪烁）。
 * 全站 NoSSR(ssr:false) 无 SSR 首屏，故不走 cookie/SSR 方案（spec D1）。
 */

/** 持久化键名与取值（spec D1）。缺省 / 损坏值一律回落浅色，不动现有浅色基线。 */
export const COLOR_MODE_STORAGE_KEY = 'kolmatrix.colorMode';

type StoredMode = 'light' | 'dark';

/** 读回持久值；无值 / 损坏值 / localStorage 不可用 → null（交由调用方回落）。 */
function readStoredMode(): StoredMode | null {
  try {
    const raw = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    // 隐私模式 / 存储被禁用：降级为不持久，不影响切换本身
    return null;
  }
}

function writeStoredMode(dark: boolean): void {
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // 同上：写不进去不阻断 UI
  }
}

export function useColorMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // 客户端挂载后同步真实状态。有持久值以持久值为准（pre-paint 脚本已置过，此处幂等）；
    // 无持久值则回落读 body —— 保持改造前行为，默认浅色。
    const stored = readStoredMode();
    if (stored !== null) {
      document.body.classList.toggle('dark', stored === 'dark');
      setIsDark(stored === 'dark');
      return;
    }
    setIsDark(document.body.classList.contains('dark'));
  }, []);

  const setDark = useCallback((dark: boolean) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark', dark);
    writeStoredMode(dark);
    setIsDark(dark);
  }, []);

  const toggle = useCallback(() => {
    if (typeof document === 'undefined') return;
    setDark(!document.body.classList.contains('dark'));
  }, [setDark]);

  return { isDark, setDark, toggle };
}

export default useColorMode;
