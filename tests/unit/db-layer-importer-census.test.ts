// M5.1b-TENANT-INJECTION F008 — db 层 importer 清单的**机械钉**。
//
// 【它守什么】`src/lib/db/runtime.ts` 与 `privileged.ts` 的文件头都写着「谁在 import 本模块」。
// M5.1 的实物证明：这类注释会失实，而且失实得很安静——runtime.ts 原文列的两个 importer
// **两头都错**（漏列真实 importer prisma.ts；写入的 instrumentation.ts 根本不 import 它），
// 由 spec-lock 稽核 grep 出来（docs/test-reports/M5.1-F001-spec-lock-review.md §4）。
// 注释无人守 = 迟早漂；本钉把那份清单从「作者自觉」升级为「不同步就红」。
//
// 【与 F003 白名单钉的分工——别互相派生】
//   本钉：谁在用**运行时 client**（注入面完整性；漏包裹的入口会从这里露头）
//   F003：谁在用 **privilegedDb**（越权面；特权连接绕过全部 RLS policy）
// 两者判据必须各自独立扫描、各自维护期望集合。一旦互相派生，一处失效就是两处同时瞎
// （M4.7 规律 2：第二层必须刻意**不从**第一层派生）。
//
// 【为什么用 readFileSync 递归遍历而不是 `git grep`】`git grep` 只搜**已跟踪**文件，
// 新文件未 commit 时恒空绿（M4.5 building 期踩过，见 project-status 关键技术坑）。
//
// 【扫描口径与两类已知假阳性】本钉只认**真实 import 语法**，不认字面出现：
//   ① 注释里提到模块路径 —— runtime.ts:3 的分工表就写着 `lib/db/privileged.ts`，
//      朴素 grep 会把它当 importer。故先剥注释再匹配。
//   ② 同名标识符 —— tests/integration/rls-tenant-isolation.test.ts:52 有个局部变量叫
//      `withTenant`，与本模块毫无关系。故只匹配 import/export-from/动态 import 三种语法，
//      不按标识符名匹配。
// 已知边界（如实登记，非本批解决）：字符串拼接出来的动态路径
// （`import('./' + name)`）扫不到。本仓 db 层无此写法，见文件末的活性证明。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = 'src';

/** 被守护的模块 → 期望的 src/ 内 importer 清单（**写死在这里，改代码才能改期望**）。 */
const GUARDED: ReadonlyArray<{
  module: string;
  /** 期望 importer（src 相对路径，已排序）。 */
  expected: readonly string[];
  /** 该模块文件头里承载这份清单的注释所在——改期望时必须同步改它。 */
  commentHome: string;
  why: string;
}> = [
  {
    module: 'src/lib/db/runtime',
    expected: ['src/lib/db/prisma.ts', 'src/lib/db/tenant-scope.ts'],
    commentHome: 'src/lib/db/runtime.ts 文件头「谁在直接 import 本模块」段',
    why:
      'prisma.ts 是代理分支三（无 ALS + 开关未开 → 回落运行时 client）；' +
      'tenant-scope.ts 是 withTenant 开事务的地方。其余 src/ 文件 import 它 = 绕过 ALS 注入面。',
  },
  {
    module: 'src/lib/db/privileged',
    // 刻意为空：privilegedDb 已存在但 src/ 尚无接线点——引导白名单是 F003 的交付物。
    // F003 落地时这里会红，那是**预期行为**：它逼着来人同时更新期望集合与 runtime.ts 的分工注释。
    expected: [],
    commentHome: 'src/lib/db/privileged.ts 文件头「谁是引导」段 + F003 的白名单普查钉',
    why:
      'privilegedDb 绕过全部 RLS policy。src/ 下每多一个 importer 就是多一处后门，' +
      '必须显式登记并写明「为什么这里必须在租户已知之前碰库」（spec D-5）。',
  },
];

/** 递归收集 src/ 下的 .ts / .tsx。 */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 剥掉注释，避免把「注释里提到的模块路径」当成 import（假阳性①）。
 * 行注释按整行剥（本仓 db 层注释均为独占行），块注释按配对剥。
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** 只认三种真实 import 语法，不按标识符名匹配（避开假阳性②）。 */
function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specs: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g, // static / side-effect
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic
    /\bexport\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g, // re-export
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) specs.push(m[1]);
  }
  return specs;
}

/** 把 import specifier 归一成 src 相对模块路径；解析不出本仓模块则 null。 */
function resolveToSrcModule(fromFile: string, spec: string): string | null {
  let resolved: string;
  if (spec.startsWith('.')) {
    resolved = normalize(join(dirname(fromFile), spec));
  } else if (spec.startsWith('@/')) {
    resolved = normalize(join(SRC_ROOT, spec.slice(2)));
  } else if (/^[a-z]/i.test(spec) && !spec.startsWith('@')) {
    // tsconfig baseUrl=src 下的裸路径（如 'lib/db/prisma'）。node_modules 包名也会落到这里，
    // 但它们归一后不会等于被守护模块，无害。
    resolved = normalize(join(SRC_ROOT, spec));
  } else {
    return null; // 作用域包（@prisma/client 等）
  }
  return resolved.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
}

/** 实测：src/ 下真正 import 目标模块的文件（排除模块自身）。 */
function actualImporters(module: string, files: string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const selfModule = file.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
    if (selfModule === module) continue;
    const specs = importSpecifiers(readFileSync(file, 'utf8'));
    if (specs.some((s) => resolveToSrcModule(file, s) === module)) {
      hits.push(file.split(/[\\/]/).join(posix.sep));
    }
  }
  return hits.sort();
}

describe('db 层 importer 清单机械钉（F008）', () => {
  const files = collectSources(SRC_ROOT);

  it('src/ 下确实扫到了文件（防止扫描器空转恒绿）', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(join('src', 'lib', 'db', 'runtime.ts'));
  });

  for (const guard of GUARDED) {
    it(`${guard.module} 的 importer 清单与实物一致`, () => {
      const actual = actualImporters(guard.module, files);
      const expectedSorted = [...guard.expected].sort();
      const missing = expectedSorted.filter((f) => !actual.includes(f));
      const unexpected = actual.filter((f) => !expectedSorted.includes(f));
      expect(
        { missing, unexpected },
        `${guard.module} 的 importer 清单漂了。\n` +
          `  期望：${expectedSorted.length ? expectedSorted.join(', ') : '(空)'}\n` +
          `  实物：${actual.length ? actual.join(', ') : '(空)'}\n` +
          `  多出（未登记的 importer）：${unexpected.join(', ') || '无'}\n` +
          `  缺失（登记了但实物没有）：${missing.join(', ') || '无'}\n` +
          `  为什么要管：${guard.why}\n` +
          `  改期望时必须同步改：${guard.commentHome}`,
      ).toEqual({ missing: [], unexpected: [] });
    });
  }

  // 【活性证明】扫描器能不能看见目标？——「0 findings」的判据必须先证明它看得见
  //（audit-methodology.md §8）。下面三条把「剥注释」「认语法」「归一路径」各证一次。
  it('活性证明：能认出真实 import，且不被注释与同名标识符骗到', () => {
    // ① 真实 import 认得出
    expect(
      importSpecifiers(`import { getRuntimeDb } from './runtime';`),
    ).toContain('./runtime');
    expect(importSpecifiers(`const m = await import('./lib/db/prisma');`)).toContain(
      './lib/db/prisma',
    );
    expect(importSpecifiers(`export { x } from 'lib/db/runtime';`)).toContain(
      'lib/db/runtime',
    );

    // ② 注释里提到路径 → 不算（假阳性①，runtime.ts:3 的分工表就是这形态）
    expect(
      importSpecifiers(`//   privilegedDb（lib/db/privileged.ts）  恒 DATABASE_URL`),
    ).toEqual([]);
    expect(importSpecifiers(`/* import { x } from './runtime'; */`)).toEqual([]);

    // ③ 同名标识符 → 不算（假阳性②，rls-tenant-isolation.test.ts:52 的局部变量）
    expect(importSpecifiers(`const withTenant = models.filter(Boolean);`)).toEqual([]);

    // ④ 路径归一：三种写法都要指向同一个模块
    expect(resolveToSrcModule('src/lib/db/prisma.ts', './runtime')).toBe(
      'src/lib/db/runtime',
    );
    expect(resolveToSrcModule('src/lib/agent/context.ts', 'lib/db/runtime')).toBe(
      'src/lib/db/runtime',
    );
    expect(resolveToSrcModule('src/app/api/x/route.ts', '@/lib/db/runtime')).toBe(
      'src/lib/db/runtime',
    );
    // 作用域包不误判成本仓模块
    expect(resolveToSrcModule('src/lib/db/runtime.ts', '@prisma/client')).toBeNull();
  });
});
