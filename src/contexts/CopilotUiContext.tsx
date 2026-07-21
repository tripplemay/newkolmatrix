'use client';
// ARCH-M05 F003 — 三区外壳通信桥：navbar 指令栏 / copilot toggle → Copilot 面板。
// 轻量 context（不引全局 store，ADR-18）：只承载两件事——
// 1) 移动端 Copilot 抽屉开关（S2-10 cop-toggle；桌面 xl 常驻不受影响）
// 2) 指令栏 Enter 提交的指令（S2 交互：内容送 Copilot 并自动打开面板）

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface CopilotCommand {
  /** 单调递增 id，消费方按 id 去重 */
  id: number;
  text: string;
}

export interface CopilotUiValue {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** 待 Copilot 消费的指令（消费后置 null） */
  command: CopilotCommand | null;
  /** 指令栏 Enter → 送 Copilot 并打开面板（移动端抽屉；桌面常驻无副作用） */
  dispatchCommand: (text: string) => void;
  /** Copilot 消费指令后回执，防止 context 变化时重复发送 */
  consumeCommand: (id: number) => void;
}

const CopilotUiContext = createContext<CopilotUiValue | null>(null);

export function CopilotUiProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [command, setCommand] = useState<CopilotCommand | null>(null);
  const nextId = useRef(1);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  const dispatchCommand = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setCommand({ id: nextId.current, text: t });
    nextId.current += 1;
    setDrawerOpen(true);
  }, []);

  const consumeCommand = useCallback((id: number) => {
    setCommand((c) => (c && c.id === id ? null : c));
  }, []);

  const value = useMemo(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      command,
      dispatchCommand,
      consumeCommand,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      command,
      dispatchCommand,
      consumeCommand,
    ],
  );

  return (
    <CopilotUiContext.Provider value={value}>
      {children}
    </CopilotUiContext.Provider>
  );
}

export function useCopilotUi(): CopilotUiValue {
  const v = useContext(CopilotUiContext);
  if (!v) {
    throw new Error(
      '[CopilotUiContext] useCopilotUi 必须在 CopilotUiProvider（admin/layout）内使用',
    );
  }
  return v;
}
