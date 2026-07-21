'use client';
// ARCH-M05 F005 — 全局轻量 Toast（裁决 #9：自建，不扩 Chakra 原语白名单）。
// 对照原型 `.toast`（S5）：单例 · 底部居中 · 绿 check + navy 底 · 2.4s 自动收 ·
// 连续调用 clearTimeout 复用同一实例（对齐原型 toastTimer 逻辑）。
// 挂载：AppWrappers 包一层 <ToastProvider>；消费方 useToast() 取 toast(message)。

import React from 'react';
import { MdCheck } from 'react-icons/md';

/** 原型定值：2.4s 自动收起 */
const TOAST_DURATION_MS = 2400;

type ToastFn = (message: React.ReactNode) => void;

interface ToastContextValue {
  toast: ToastFn;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastFn {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      'useToast 必须在 <ToastProvider> 内使用（AppWrappers 已挂载全局实例）',
    );
  }
  return ctx.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = React.useState<React.ReactNode>(null);
  const [visible, setVisible] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = React.useCallback<ToastFn>((next) => {
    setMessage(next);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[30px] left-1/2 z-[130] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-navy-700 px-5 py-3.5 text-compact font-semibold text-white shadow-xl transition-all duration-200 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'
        }`}
      >
        {message != null && (
          <>
            <MdCheck
              className="h-4 w-4 shrink-0 text-horizonGreen-400"
              aria-hidden
            />
            {message}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
