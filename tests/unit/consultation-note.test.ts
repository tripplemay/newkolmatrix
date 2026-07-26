// M4.7-FRONTDESK F008 — 咨询痕迹的呈现契约
//
// 【本文件钉的是什么】单一前台把专家隐入内部，用户只听得见前台的声音。
// 那么"这个结论是谁给的、他读了什么、完不完整"必须**在收起态就看得见**——
// 展开才说等于没说（用户不会逐条点开）。这条是产品红线的 UI 侧对应物：
// 后端已保证 ok / insufficientEvidence / budgetHit 三个字段如实，前端不能把它们藏起来。
//
// 【为什么是源码级契约断言而不是渲染测试】vitest 配置固定 environment:'node'
//（无 jsdom），本仓一贯做法是 UI 契约用源码断言 + 视觉基线兜住渲染。
// 如实说明其上限：它挡得住"字段被删/被移进展开区"，挡不住样式层面的隐藏。

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  'src/components/copilot/canvas/ConsultationNote.tsx',
  'utf8',
);
const REGISTRY = readFileSync(
  'src/components/copilot/canvas/canvas-registry.tsx',
  'utf8',
);

/** 收起态 = <button> 内部；展开态 = {open && ...} 块内。 */
function collapsedBlock(): string {
  const start = SRC.indexOf('<button');
  const end = SRC.indexOf('</button>');
  expect(start, '组件结构变更须同步本测试').toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('画布路由', () => {
  it('consultation 走既有 type 路由键（不新开通道）', () => {
    expect(REGISTRY).toContain("'consultation'");
    expect(REGISTRY).toContain('ConsultationNote');
  });
});

describe('三类「不完整」必须在收起态就可见', () => {
  const collapsed = collapsedBlock();

  it('咨询失败（ok=false）有收起态标记', () => {
    expect(collapsed).toContain('!output.ok');
    expect(collapsed).toContain('咨询失败');
  });

  it('证据不足有收起态标记（不能只在展开区说）', () => {
    expect(collapsed).toContain('output.insufficientEvidence');
    expect(collapsed).toContain('证据不足');
  });

  it('没答完（budgetHit）有收起态标记', () => {
    expect(collapsed).toContain('output.budgetHit');
    expect(collapsed).toContain('未答完');
  });

  it('收起态写明是谁答的（专家隐入内部 ≠ 变黑箱）', () => {
    expect(collapsed).toContain('咨询了');
    expect(collapsed).toContain('{who}');
  });
});

describe('安全红线（FR-12.16）', () => {
  it('不用 dangerouslySetInnerHTML 承接模型文本', () => {
    expect(SRC).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('失败态不编造', () => {
  it('ok=false 时展示的是 failureReason，不是兜底文案冒充结论', () => {
    expect(SRC).toContain('output.failureReason');
    expect(SRC, '不得给失败态编一个像结论的默认值').not.toMatch(
      /failureReason\s*\?\?\s*'(?!未知原因)/,
    );
  });
});

describe('M4.7 fix_round1 补项', () => {
  it('痕迹展示「问了什么」（只说咨询了谁 = 用户无从判断问对没问对）', () => {
    expect(SRC).toContain('output.question');
    expect(SRC).toContain('问的是：');
  });

  it('专家展示名**与 registry 同源**，组件内不得自带映射表', () => {
    // 首轮验收：组件自带 AGENT_LABEL 映射 → registry 改名它不跟着变，双份说法。
    expect(SRC, '不得再硬编码人格名映射').not.toMatch(/AGENT_LABEL\s*[:=]/);
    expect(SRC, '应从 registry 取名').toContain('getPersona');
  });

  it('PersonaSwitchNote 语义已随单一前台更新（handoff ≠ 面板换人）', () => {
    const note = readFileSync(
      'src/components/copilot/PersonaSwitchNote.tsx',
      'utf8',
    );
    expect(note).toContain('对话身份恒为前台');
    expect(note, '要说清 consult 与 handoff 两条路径语义不同').toContain(
      'consult = 问出去',
    );
  });
});
