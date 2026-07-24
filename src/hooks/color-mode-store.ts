// M3-B-DELIVERY F012（BL-FE-16）— 深浅色模式的模块级 store（跨实例同步）。
//
// 【缺陷】改造前 `useColorMode` 每个调用点各持一份 `useState` + 空依赖 `useEffect`，
// 没有任何跨实例订阅原语：持有 toggle 的消费者自翻自更新，**纯读取方只在挂载那一刻
// 同步一次**，活体切换永远收不到通知；多标签页之间同样不同步（backlog BL-FE-16）。
//
// 【P11 修法】唯一状态源仍是 `body.dark`（DS-FOUNDATION F005 的 D2 不变），
// 但订阅关系收敛到本模块级 store：
//   - 变更侦测 = MutationObserver 监听 `body` 的 class 属性（谁改的都能收到，
//     包括 layout.tsx 的 pre-paint 内联脚本与 devtools 手改）
//   - 跨标签页 = `storage` 事件：别的标签页写了持久值 → 本页把 class 应用上 →
//     MutationObserver 自然触发通知（两条链路汇成一条，不各通知一次）
//   - React 侧用 `useSyncExternalStore` 订阅（hooks/useColorMode.ts）
//
// 【为什么分出 target 抽象】把「浏览器怎么读写/怎么监听」与「store 怎么广播」分开：
// store 的多消费者语义因此可在 node 环境被单测穷举（仓内 vitest 是 node 环境、无 jsdom，
// vitest.config.ts 明文不引），而不是只能靠浏览器探针。这不是为测试而设的后门——
// browser target 是唯一的生产实现，与 ops/email 的「接口 + 实现」同款分层。

/** 持久化键名与取值（P2-CLEANUP F002 沿用）。缺省 / 损坏值一律回落浅色。 */
export const COLOR_MODE_STORAGE_KEY = 'kolmatrix.colorMode';

export type StoredMode = 'light' | 'dark';

/** store 与宿主环境之间的唯一接缝。 */
export interface ColorModeTarget {
  /** 当前是否深色（真相源，浏览器实现 = body.classList.contains('dark')）。 */
  isDark(): boolean;
  /** 应用深浅色（写真相源 + 持久化）。 */
  apply(dark: boolean): void;
  /**
   * 订阅外部变更（class 变动 / 其它标签页写入），返回取消订阅。
   * 只在第一个订阅者到来时被调用，最后一个离开时取消——不留常驻句柄。
   */
  observe(onChange: () => void): () => void;
}

export interface ColorModeStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): boolean;
  getServerSnapshot(): boolean;
  setDark(dark: boolean): void;
  toggle(): void;
  /** 挂载时把持久值同步到真相源（幂等；无持久值则保持现状）。 */
  syncFromStorage(): void;
}

export function createColorModeStore(target: ColorModeTarget): ColorModeStore {
  const listeners = new Set<() => void>();
  let unobserve: (() => void) | null = null;

  const notify = () => {
    // 复制一份再遍历：监听者在回调里退订不会跳过后续监听者
    for (const l of [...listeners]) l();
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) unobserve = target.observe(notify);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && unobserve) {
          unobserve();
          unobserve = null;
        }
      };
    },
    // 布尔快照可每次现算：React 用 Object.is 比较，基元值无需缓存
    getSnapshot: () => target.isDark(),
    // SSR / pre-hydration 恒浅色（全站 NoSSR，但 useSyncExternalStore 契约要求提供）
    getServerSnapshot: () => false,
    setDark(dark: boolean) {
      target.apply(dark);
      // 浏览器实现下 MutationObserver 会再广播一次（幂等）；
      // 这里显式广播是为了让不带 observer 的宿主（测试替身/未来 target）也立即一致。
      notify();
    },
    toggle() {
      this.setDark(!target.isDark());
    },
    syncFromStorage() {
      const stored = readStoredMode();
      if (stored !== null) target.apply(stored === 'dark');
    },
  };
}

/** 读回持久值；无值 / 损坏值 / localStorage 不可用 → null（交由调用方回落）。 */
export function readStoredMode(): StoredMode | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    // 隐私模式 / 存储被禁用：降级为不持久，不影响切换本身
    return null;
  }
}

function writeStoredMode(dark: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // 同上：写不进去不阻断 UI
  }
}

/** 浏览器实现：body.dark 为真相源 + localStorage 持久化 + class/storage 双通道监听。 */
export const browserColorModeTarget: ColorModeTarget = {
  isDark(): boolean {
    if (typeof document === 'undefined') return false;
    return document.body.classList.contains('dark');
  },
  apply(dark: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark', dark);
    writeStoredMode(dark);
  },
  observe(onChange: () => void): () => void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return () => undefined;
    }
    const observer = new MutationObserver(onChange);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    // 多标签页：别的标签页写了持久值 → 本页应用到 body → 上面的 observer 触发通知
    const onStorage = (e: StorageEvent) => {
      if (e.key !== COLOR_MODE_STORAGE_KEY) return;
      const next = e.newValue === 'dark';
      if (next !== browserColorModeTarget.isDark()) {
        document.body.classList.toggle('dark', next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
    };
  },
};

/** 全站单例（所有 useColorMode 实例共享同一订阅关系——这正是 BL-FE-16 缺的那一份）。 */
export const colorModeStore = createColorModeStore(browserColorModeTarget);
