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

// ────────────────────────────────────────────────────────────────────────────
// M4.7-FRONTDESK F002 — 升级为**传递闭包**扫描
//
// 上面那道只查「工具模块**直接** import tools/index」。M4.7 的 consult_specialist
// 撞到的是传递链：
//   tools/index → consult-specialist → specialist-loop → to-ai-sdk-tools
//                → execute → tools/index
// 每一跳都合法，合起来成环——直接 import 的正则一个都抓不到，仍然只在
// `next build` 的 prerender 阶段 TDZ 崩。故把判据从「一跳」升级为「顺着静态
// import 一路走下去，能不能走回装配入口」。
//
// 惰性 `await import(...)` 不计入：它在运行期解析，模块初始化期不成环——
// 这正是 specialist-loop 采用的断环手法。
// ────────────────────────────────────────────────────────────────────────────

const AGENT_DIR = 'src/lib/agent';
const ENTRY = path.join(AGENT_DIR, 'tools/index.ts');

/** 解析一个模块的**静态** import 目标（相对路径 → 仓内文件路径）。 */
function staticImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const code = src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const out: string[] = [];
  // 只取静态 `from '...'`；`await import('...')` 形态不匹配（它没有 from）
  for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[1];
    const base = path.normalize(path.join(path.dirname(file), spec));
    for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
      try {
        readFileSync(cand, 'utf8');
        out.push(cand);
        break;
      } catch {
        /* 不是仓内 ts 文件（如 .json / 类型包），跳过 */
      }
    }
  }
  return out;
}

/** 从 start 出发顺静态 import 走，返回到达 ENTRY 的路径（无则 null）。 */
function pathToEntry(start: string): string[] | null {
  const seen = new Set<string>();
  const queue: Array<{ file: string; trail: string[] }> = [
    { file: start, trail: [start] },
  ];
  while (queue.length) {
    const { file, trail } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of staticImports(file)) {
      if (path.normalize(next) === path.normalize(ENTRY)) {
        return [...trail, next];
      }
      queue.push({ file: next, trail: [...trail, next] });
    }
  }
  return null;
}

describe('传递闭包：工具模块顺静态 import 走不回装配入口（M4.7 升级）', () => {
  it('扫描器能看见目标——装配入口自己的成员确实指向它（活性证明）', () => {
    // 若这条不成立，说明 staticImports 解析失效，下面的「无环」结论毫无意义。
    // index.ts import 了各工具模块，故从 index 出发一跳即到自身之外的模块。
    expect(staticImports(ENTRY).length).toBeGreaterThan(10);
  });

  for (const file of toolModules()) {
    it(`${path.basename(file)} 的静态依赖闭包不含 tools/index`, () => {
      const trail = pathToEntry(file);
      expect(
        trail,
        trail
          ? `循环导入（只会在 next build 炸）：\n  ${trail.join('\n  → ')}`
          : '',
      ).toBeNull();
    });
  }
});
