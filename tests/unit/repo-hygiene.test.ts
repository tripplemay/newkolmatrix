// M1-A-BRIEF fixing-1 — 仓库卫生回归测试。
//
// 来源：F001 验收 PARTIAL（对抗复核维持原判）——vitest 的 coverage/ 产物被提交进 git
// 且 .gitignore 未登记，导致 acceptance 要求接入 CI 的 `npm run test:unit:coverage`
// 每跑一次就弄脏 9 个 tracked 文件，并在仓内留下一份会过期却宣称具体覆盖率数字的假快照。
//
// 这条测试守的是「生成产物不入库」这一仓库自订约定（.gitignore 里 /test-results/、
// /playwright-report/ 已成文同一约定，而刻意基线 tests/screenshots/baseline/*.png 入库）。
//
// 修复前后对比（回归测试的意义所在）：
//   修复前 `git ls-files coverage/` = 16 → 本文件第一条断言失败
//   修复前 `git check-ignore coverage/index.html` 无匹配（exit 1）→ 第二条断言失败
//   修复后分别为 0 与 exit 0 → 两条通过

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/** 跑 git 并返回 stdout；非零退出时返回 null（供判定「是否被忽略」这类以退出码表意的命令）。 */
function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

/**
 * 各类工具的生成产物目录。新增构建/测试工具时在此登记，
 * 让「产物入库」这类失误在 CI 当场翻红，而不是靠 review 时肉眼发现。
 */
const GENERATED_DIRS = [
  { dir: 'coverage', probe: 'coverage/index.html', tool: 'vitest --coverage' },
  { dir: 'test-results', probe: 'test-results/.last-run.json', tool: 'playwright' },
  { dir: 'playwright-report', probe: 'playwright-report/index.html', tool: 'playwright' },
];

describe('生成产物不得入库（.gitignore 已成文的仓库约定）', () => {
  for (const { dir, probe, tool } of GENERATED_DIRS) {
    it(`${dir}/ 目录下没有被 git 跟踪的文件（产物来自 ${tool}）`, () => {
      const tracked = (git(['ls-files', `${dir}/`]) ?? '')
        .split('\n')
        .filter(Boolean);
      expect(
        tracked,
        `${dir}/ 下有 ${tracked.length} 个文件被 git 跟踪。` +
          `生成产物入库会让每次跑该工具都弄脏工作区，并在仓内留下会过期的假快照。` +
          `修法：.gitignore 加 /${dir}/ 且 git rm -r --cached ${dir}`,
      ).toEqual([]);
    });

    it(`${dir}/ 已被 .gitignore 登记`, () => {
      // check-ignore 以退出码表意：0 = 被忽略，1 = 未被忽略。路径不必真实存在。
      const ignored = git(['check-ignore', probe]) !== null;
      expect(
        ignored,
        `${probe} 未被 .gitignore 忽略——产物会在下次 git add -A 时被扫进无关 commit`,
      ).toBe(true);
    });
  }
});
