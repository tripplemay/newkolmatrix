// F003 复验 harness（Evaluator 独立产物，reverifying 轮，不改产品代码）
//
// 与首轮 f003-harness 的差异（刻意不复用，避免继承同一套盲点）：
//   1. 不经 hooks/useColorMode —— 由测试脚本直接切 body.dark，验证「跟随」是否真的零 JS 依赖
//   2. 额外挂载 ChakraNextAvatar（chakra() 包装路径），该路径首轮两套测试均未覆盖
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NextAvatar, ChakraNextAvatar } from '../../../src/components/image/Avatar';

function Harness() {
  return (
    <div>
      {/* 裸组件 + showBorder：acceptance「深色下边框跟随」的主路径 */}
      <div id="plain-border" style={{ width: 80, height: 80 }}>
        <NextAvatar src="/avatar.png" showBorder alt="plain-border" />
      </div>
      {/* chakra() 包装 + showBorder：acceptance 要求「chakra() 包装保留」，
          但 shouldForwardProp 白名单不含 showBorder/className —— 实测该路径行为 */}
      <div id="chakra-border" style={{ width: 80, height: 80 }}>
        <ChakraNextAvatar src="/avatar.png" showBorder alt="chakra-border" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
