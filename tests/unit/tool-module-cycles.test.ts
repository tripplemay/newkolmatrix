// M4.5-AGENT-LOOP F004 fix — 工具模块循环导入回归测试
//
// 触发源（CI 实证）：`propose-plan.ts` 曾从 `./index` 导入 `ensureNativeToolsRegistered`，
// 而 `index.ts` 反向 import `proposePlanTool` 并在模块顶层调用注册——形成循环。
// vitest / dev 下不炸（模块图求值顺序恰好安全），但 `next build` 的生产构建期
// prerender 阶段直接 TDZ 崩：
//   Error occurred prerendering page "/api/agent/plan-ack"
//   ReferenceError: Cannot access 'l' before initialization
//
// 这类失效**延迟暴露**（本地全绿、单测全绿，只有 build 才红），所以要机制化拦住：
// 工具模块一律不得反向依赖装配入口 `tools/index.ts`。需要「确保已注册」的场景由
// `executeTool`（唯一执行入口，自带幂等注册）负责。
//
// 修复前后对比：修复前 propose-plan.ts 含 `from './index'` → 本测试红；修复后 → 绿。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const TOOLS_DIR = 'src/lib/agent/tools';

/** 装配入口自身与低层注册表不在受检之列。 */
const EXEMPT = new Set(['index.ts', 'registry.ts', 'types.ts']);

function toolModules(): string[] {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && !EXEMPT.has(f))
    .map((f) => path.join(TOOLS_DIR, f));
}

describe('工具模块不得反向依赖装配入口（循环 → 生产构建期 TDZ）', () => {
  it('受检模块非空（目录改名时本测试不得静默失效）', () => {
    expect(toolModules().length).toBeGreaterThan(10);
  });

  for (const file of toolModules()) {
    it(`${path.basename(file)} 不 import tools/index`, () => {
      const src = readFileSync(file, 'utf8');
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      // './index' / './index.js' / '../tools' 三种写法都指向同一装配入口
      expect(code, `${file} 反向依赖 tools/index（循环导入）`).not.toMatch(
        /from\s+['"](\.\/index(\.js)?|\.\.\/tools)['"]/,
      );
    });
  }
});
