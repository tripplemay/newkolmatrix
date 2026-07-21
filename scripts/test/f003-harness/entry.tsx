// F003 独立验收 harness（Evaluator 产物，不入产品代码）
// 直接挂载真实 src/components/image/Avatar.tsx 的 NextAvatar，用真实 hooks/useColorMode 切换，
// 页面 link 真实构建产物 CSS —— 以此实测「深色下 Avatar 边框跟随」。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextAvatar } from '../../../src/components/image/Avatar';
import { NextAvatar as NextAvatarBefore } from './AvatarBefore';
import useColorMode from 'hooks/useColorMode';

function Harness() {
  const { isDark, toggle } = useColorMode();
  return (
    <div>
      <button id="toggle" onClick={toggle}>
        toggle (isDark={String(isDark)})
      </button>
      <div id="after-border" style={{ width: 80, height: 80 }}>
        <NextAvatar src="/avatar.png" showBorder alt="after-border" />
      </div>
      <div id="after-noborder" style={{ width: 80, height: 80 }}>
        <NextAvatar src="/avatar.png" alt="after-noborder" />
      </div>
    </div>
  );
}

function HarnessBefore() {
  return (
    <div id="before-border" style={{ width: 80, height: 80 }}>
      <NextAvatarBefore src="/avatar.png" showBorder alt="before-border" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

// 旧版单独挂载：若 Chakra 无 Provider 时 useColorMode 抛错，隔离到自己的 root，不影响上面的断言
try {
  createRoot(document.getElementById('root-before')!).render(<HarnessBefore />);
} catch (e) {
  (window as any).__beforeError = String(e);
}
