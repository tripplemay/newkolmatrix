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
// 【扫描口径】本钉只认**真实 import 语法**，不认字面出现。两类典型的字面出现：
//   ① 注释里提到模块路径 —— runtime.ts:3 的分工表就写着 `lib/db/privileged.ts`；
//   ② 同名标识符 —— tests/integration/rls-tenant-isolation.test.ts:52 有个局部变量叫
//      `withTenant`，与本模块毫无关系。
// 二者都由「按语法树取，不按文本取」自然排除（下方 importSpecifiers）。
//
// 【M5.1c F001：判据从正则换成 TypeScript AST】
// 换代的理由是三轮实测账，不是偏好。M5.1b 的正则版被逐版探针量过：
//   原始版漏 5 种 → fix-3 版漏 6 种 → fix-4 版漏 0 种（复验方 21 条探针），
// 但**每一次「修好」都换来新的漏抓**：fix-3 解掉侧效应吞噬却引入「行尾注释含引号整条漏抓」
// 与「ES2022 字符串绑定名」两类；fix-4 解掉那两类却把 re-export 放宽成 `[^;]*?`，
// 重新放进跨语句误捕（无分号的 `export const a = 1` 后文散文含 ` from '…'` → **凭空捏造** importer）。
// 到第三轮，改一处就要重验另外五处。根因不是某条正则写错，是判据形态选错了。
//
// 【本版仍抓不到的（如实登记，且各配一条「故意断言抓不到」的用例）】
//   **运行期才能确定的路径**：`import('./' + name)`、`` import(`./${name}`) ``。
//   语法树看得见调用点，看不见值——这是静态分析的固有边界，不是判据缺陷。
//   要覆盖它得做常量折叠/数据流分析，那是另一个量级的东西，本批不做。
// 本段不对「除此之外全都抓得到」作任何断言；实际射程 = 下面 importSpecifiers 的五个分支
// 加上各自的用例，以那些用例为准。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 扫描面 = `src/`。**tests/ 侧显式决定：不纳入**（M5.1b spec §4 硬约束第 2 条要求表态，
 * M5.1b fix-1 补写——首轮验收查出两道钉都只是硬编码 'src' 而无任何表态，属「默认略过」）。
 *
 * 理由：本钉守的是「模块文件头注释里的 importer 清单与实物同步」，而那些文件头描述的是
 * **产品运行时**的注入面（谁在用运行时 client / 特权 client）。测试文件 import 这两个模块是
 * 为了建夹具与做对照组（F002 / F005 / F006 的夹具都这么写），它们不构成运行时注入面，
 * 纳入只会让期望清单随测试增删而反复变更，把这道钉变成噪声源。
 *
 * **代价如实登记：** tests/ 侧新增的 db 层 importer 不会被本钉记账，故「注入面完整性」这一
 * 结论只对 src/ 成立。同一决定与同一代价写在 tests/unit/bootstrap-whitelist-census.test.ts
 * 文件头（两钉射程保持一致，避免一钉扫一边造成假的互补感）。
 */
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
    expected: [
      'src/instrumentation.ts',
      'src/lib/db/prisma.ts',
      'src/lib/db/tenant-scope.ts',
    ],
    commentHome: 'src/lib/db/runtime.ts 文件头「谁在直接 import 本模块」段',
    why:
      'prisma.ts 是代理分支三（无 ALS + 开关未开 → 回落运行时 client）；' +
      'tenant-scope.ts 是 withTenant 开事务的地方。其余 src/ 文件 import 它 = 绕过 ALS 注入面。',
  },
  {
    module: 'src/lib/db/privileged',
    // M5.1b F003 已接线：这 5 处即引导白名单（每处的「为什么必须绕过 RLS」写在调用点旁）。
    // 本条守的是**文档面**（清单与实物同步）；越权面由 F003 自己的普查钉独立守，两者不互相派生。
    expected: [
      'src/app/api/auth/[...nextauth]/route.ts',
      'src/app/api/auth/register/route.ts',
      'src/lib/agent/context.ts',
      'src/lib/auth/index.ts',
      'src/lib/auth/register.ts',
    ],
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
 * 取出一份源码里全部 module specifier —— **按语法树取，不按文本取**。
 *
 * 【为什么第二个参数是文件名，而且必须传真的】
 * `ts.createSourceFile` 由扩展名推断 ScriptKind，而 **TS 与 TSX 的解析结果会互相吞 import**。
 * 本批实测（两个方向都探过）：
 *   · `.ts` 源当 `.tsx` 解析 → `const x = <string>y;` 被当成未闭合 JSX，**其后的 import 整条消失**；
 *   · `.tsx` 源当 `.ts` 解析 → 本次探针里侥幸没丢（解析器错误恢复兜住了），但不可依赖。
 * 前一个方向正是「钉对整个文件恒盲」的形态——与 M5.1b 那次幻影块注释同款，只是换了成因。
 * 故 `actualImporters` 一律传入真实路径；下面 `🔒 ScriptKind` 那条用例守住这件事。
 * 默认值 `scan.ts` 只服务于直接传源码串的单元用例。
 *
 * 【五个分支 = 本判据的全部射程】每个分支各有一条用例，且各自变异证活过（摘掉该分支 → 那条红）：
 *   ① ImportDeclaration          —— 含侧效应 `import 'x'`、`import type`、import attributes
 *   ② ExportDeclaration          —— 含 `export * from` / `export * as ns from` / `export type … from`
 *   ③ ImportEqualsDeclaration    —— `import Foo = require('x')`
 *   ④ 动态 `import()`
 *   ⑤ CJS `require()`
 *
 * `isStringLiteralLike` 而非 `isStringLiteral`：前者含 NoSubstitutionTemplateLiteral，
 * 即反引号**无替换**的静态路径（`` import(`../db/runtime`) ``，src/instrumentation.ts 在用）。
 * 带替换的模板串是 TemplateExpression，不在此列——那正是上面登记的运行期边界。
 */
function importSpecifiers(source: string, fileName = 'scan.ts'): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);
  const specs: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      // ① 静态 import（moduleSpecifier 在合法语法下恒为字符串字面量；语法错误时可能不是）
      if (ts.isStringLiteralLike(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      // ② re-export。**`node.moduleSpecifier` 必须判空**：`export { x };` 是没有 from 子句的
      //    本地导出，此处为 undefined —— 漏判会当场抛，而不是安静地多抓一条。
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specs.push(node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      // ③ `import Foo = require('x')`（TS 特有）。`Foo = Bar.Baz` 那种别名不是外部模块引用。
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        specs.push(node.moduleReference.expression.text);
      }
    } else if (ts.isCallExpression(node)) {
      // ④⑤ 动态 import() 与 CJS require()。前者的 expression 是 ImportKeyword 而非标识符，
      //     故无法与名叫 import 的变量混淆；后者按标识符名认，与语言无关的约定俗成。
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const first = node.arguments[0];
      // 尾逗号、第二参数（import attributes）都不影响：arguments[0] 照样是路径。
      if ((isDynamicImport || isRequire) && first && ts.isStringLiteralLike(first)) {
        specs.push(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
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

/**
 * 实测：src/ 下真正 import 目标模块的文件（排除模块自身）。
 *
 * `scanned` 是「文件 → 该文件全部 specifier」的预扫结果。预扫一次而不是每个被守模块各扫一遍：
 * 建 AST 比跑正则贵，src/ 有 384 个文件、GUARDED 有 2 条，重复解析就是 768 次。
 */
function actualImporters(module: string, scanned: ReadonlyMap<string, readonly string[]>): string[] {
  const hits: string[] = [];
  for (const [file, specs] of scanned) {
    const selfModule = file.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
    if (selfModule === module) continue;
    if (specs.some((s) => resolveToSrcModule(file, s) === module)) {
      hits.push(file.split(/[\\/]/).join(posix.sep));
    }
  }
  return hits.sort();
}

describe('db 层 importer 清单机械钉（F008 立，M5.1c F001 换 AST 判据）', () => {
  const files = collectSources(SRC_ROOT);
  /** 预扫一次：文件 → 全部 specifier。传入真实路径，让 ScriptKind 随扩展名走。 */
  const scanned = new Map<string, readonly string[]>(
    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'), f)]),
  );

  it('src/ 下确实扫到了文件（防止扫描器空转恒绿）', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(join('src', 'lib', 'db', 'runtime.ts'));
  });

  it('预扫确实取到了 specifier（防止「解析全失败 → 处处空集」恒绿）', () => {
    // 没有这条，若 AST 解析整体失效（传错 ScriptKind、typescript 版本不兼容、
    // visit 写漏），每个模块的实测 importer 都会是空集；而 GUARDED 里两条都非空，
    // 那时会红——但红成「缺失」而非「扫描器坏了」，排障方向会被带偏。这条先把话说清楚。
    const nonEmpty = [...scanned.values()].filter((s) => s.length > 0).length;
    expect(nonEmpty, 'src/ 下没有任何文件解析出 specifier —— 扫描器整体失效').toBeGreaterThan(
      files.length * 0.8,
    );
  });

  for (const guard of GUARDED) {
    it(`${guard.module} 的 importer 清单与实物一致`, () => {
      const actual = actualImporters(guard.module, scanned);
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

  // ══════════════════════════════════════════════════════════════════
  // 遍历面逐分支证活。**每条各自摘掉对应 visitor 分支即红，且只红它**——
  // 这是「变异要看红了几条」（audit-methodology.md §7.1 推论一）的直接落实：
  // 若一条用例只能与全文件一起红，它就没有独立鉴别力，不该冒充守卫。
  // ══════════════════════════════════════════════════════════════════
  it('🔒 遍历面① ImportDeclaration：具名 / 默认 / 侧效应 / type / attributes', () => {
    expect(importSpecifiers(`import { getRuntimeDb } from './runtime';`)).toEqual(['./runtime']);
    expect(importSpecifiers(`import Card from 'components/card';`)).toEqual(['components/card']);
    // 侧效应 import 后跟 from-import —— 正则版最顽固的那处吞噬，AST 下是两个平行节点
    expect(importSpecifiers("import './runtime';\nimport { z } from 'zod';")).toEqual([
      './runtime',
      'zod',
    ]);
    expect(importSpecifiers(`import type { A } from './t';`)).toEqual(['./t']);
    expect(importSpecifiers(`import j from './d.json' with { type: 'json' };`)).toEqual([
      './d.json',
    ]);
    // 无空格写法（正则版已知抓不到，登记在案）
    expect(importSpecifiers(`import{a}from'x';`)).toEqual(['x']);
    expect(importSpecifiers(`import'x';`)).toEqual(['x']);
  });

  it('🔒 遍历面② ExportDeclaration：re-export / export * / export * as ns / export type', () => {
    expect(importSpecifiers(`export { x } from 'lib/db/runtime';`)).toEqual(['lib/db/runtime']);
    expect(importSpecifiers(`export * from './all';`)).toEqual(['./all']);
    expect(importSpecifiers(`export * as ns from './ns';`)).toEqual(['./ns']);
    expect(importSpecifiers(`export type { A } from './te';`)).toEqual(['./te']);
    // 没有 from 子句的本地导出：moduleSpecifier 为 undefined。
    // 漏掉那道判空不是「多抓一条」，是当场抛 —— 这条同时守住那个判空。
    expect(importSpecifiers(`export { x };`)).toEqual([]);
    expect(importSpecifiers(`export const dynamic = 'force-dynamic';`)).toEqual([]);
  });

  it('🔒 遍历面③ ImportEqualsDeclaration：import Foo = require(...)', () => {
    expect(importSpecifiers(`import Foo = require('./legacy');`)).toEqual(['./legacy']);
    // 命名空间别名不是外部模块引用，不得误捕
    expect(importSpecifiers(`import Alias = Some.Namespace.Member;`)).toEqual([]);
  });

  it('🔒 遍历面④ 动态 import()：含第二参数与尾逗号', () => {
    expect(importSpecifiers(`const m = await import('./lib/db/prisma');`)).toEqual([
      './lib/db/prisma',
    ]);
    // 尾逗号（正则版漏抓，U5）
    expect(importSpecifiers(`const m = await import('./trail',);`)).toEqual(['./trail']);
    // import attributes 作第二参数（正则版漏抓）
    expect(
      importSpecifiers(`const m = await import('./x', { with: { type: 'json' } });`),
    ).toEqual(['./x']);
  });

  it('🔒 遍历面⑤ CJS require()：认调用，不认同名的别的东西', () => {
    expect(importSpecifiers(`const m = require('./runtime');`)).toEqual(['./runtime']);
    // 非字面量实参不算（值要运行期才知道）
    expect(importSpecifiers(`const m = require(name);`)).toEqual([]);
  });

  it('🔒 字面量形态：反引号无替换要认，带替换的模板串必须不认', () => {
    // 这条钉住 `isStringLiteralLike` 而不是 `isStringLiteral` —— 两个方向都守：
    //   · 收窄成 isStringLiteral → 第一段红（src/instrumentation.ts 正在用反引号动态 import）
    //   · 放宽到接受 TemplateExpression → 第二段红（会把 './${name}' 的字面片段当成真路径）
    expect(importSpecifiers('const m = await import(`../db/runtime`);')).toEqual([
      '../db/runtime',
    ]);
    expect(importSpecifiers('const m = await import(`./${name}`);')).toEqual([]);
  });

  it('🔒 importSpecifiers 的 ScriptKind 随传入的文件名走（守不住「预扫有没有传」，见注释）', () => {
    // 【本批实测发现，不是假想】`.ts` 源当 `.tsx` 解析时，`<string>y` 被当成未闭合 JSX，
    // **其后的 import 整条消失** —— 钉对该文件恒盲，与 M5.1b 那次幻影块注释同款形态。
    // 变异证活：把 importSpecifiers 里的 fileName 写死成 'scan.tsx' → 本条红（且只红本条）。
    //
    // 【本条守不住什么 —— 如实登记】它守的是 importSpecifiers **拿到文件名之后**的行为。
    // 上面预扫那行若把第二参数摘掉（`importSpecifiers(readFileSync(f,'utf8'))`），本条
    // **一声不吭**：实测 21 条全绿。原因是本仓当前没有任何文件在 TS / TSX 两种模式下结果不同
    //（等价性审计：384 文件两侧 specifier 多重集完全一致），因此没有任何行为差异可供断言。
    // 要守住它得往 src/ 塞一个专供测试的畸形文件，代价大于收益，本批不做。
    // 用例名已按此收窄——**断言的名字不得大于它机械守得住的东西**（audit-methodology.md §7.1 推论二）。
    const tsSource = `const x = <string>y;\nimport { a } from './after-ts';`;
    expect(importSpecifiers(tsSource, 'a.ts'), 'TS 源被按 TSX 解析，import 被 JSX 吞掉').toEqual(
      ['./after-ts'],
    );
    // 反方向：.tsx 源必须按 TSX 解析（JSX 是合法语法，不该报废整棵树）
    const tsxSource = `const C = () => <div className="x">hi</div>;\nimport { b } from './after-tsx';`;
    expect(importSpecifiers(tsxSource, 'b.tsx')).toEqual(['./after-tsx']);
  });

  it('🔒 字面出现不算 import：注释 / 字符串 / 同名标识符', () => {
    // ① 注释里提到路径（runtime.ts:3 的分工表就是这形态）
    expect(
      importSpecifiers(`//   privilegedDb（lib/db/privileged.ts）  恒 DATABASE_URL`),
    ).toEqual([]);
    expect(importSpecifiers(`/* import { x } from './runtime'; */`)).toEqual([]);
    // ② 普通字符串里的 import 语句（正则版误捕，U4）
    expect(importSpecifiers(`const s = "import { x } from './fake';";`)).toEqual([]);
    // ③ 同名标识符（rls-tenant-isolation.test.ts:52 的局部变量）
    expect(importSpecifiers(`const withTenant = models.filter(Boolean);`)).toEqual([]);
  });

  it('🔒 已登记边界仍如实：运行期才定的路径确实抓不到（不是声称，是实测）', () => {
    // 这两条**故意断言「抓不到」**：已知边界要有实测支撑，否则「已登记」也会变成空话。
    // 它们也是上面「不认 TemplateExpression」那条的另一半——那里守判据，这里守登记。
    expect(importSpecifiers("const m = await import('./' + name);")).toEqual([]);
    expect(importSpecifiers('const m = await import(`./${name}`);')).toEqual([]);
    expect(importSpecifiers('const m = await import(pathFromConfig);')).toEqual([]);
  });

  it('路径归一：三种写法指向同一模块，作用域包不误判', () => {
    expect(resolveToSrcModule('src/lib/db/prisma.ts', './runtime')).toBe('src/lib/db/runtime');
    expect(resolveToSrcModule('src/lib/agent/context.ts', 'lib/db/runtime')).toBe(
      'src/lib/db/runtime',
    );
    expect(resolveToSrcModule('src/app/api/x/route.ts', '@/lib/db/runtime')).toBe(
      'src/lib/db/runtime',
    );
    expect(resolveToSrcModule('src/lib/db/runtime.ts', '@prisma/client')).toBeNull();
  });

  // ══════════════════════════════════════════════════════════════════
  // 📜 正则时代的漏抓/误捕语料
  //
  // 【这一条不是守卫，是语料 —— 如实说明，免得它冒充鉴别力】
  // 下面每种形态在正则版上都实测红过（来源逐条标注），换 AST 后**按构造不可能复发**：
  // 它们全都是「文本层看不出语句边界」造成的，而语法树里语句边界是节点边界。
  // 因此本条**没有独立的变异**：唯一能让它红的改动（摘掉 visitor 分支）会同时红掉
  // 上面五条遍历面用例。保留它的理由只有一个 —— 记住这些形态曾经真的漏过，
  // 谁若哪天想把判据改回文本匹配，这里是现成的反例清单。
  //
  // M5.1c F001 按 spec D-3 逐条重验了 M5.1b 留下的 7 条正则期回归用例：
  //   · 3 条在 AST 下仍有独立鉴别力 → 已改写并上移（反引号动态 import → 「字面量形态」；
  //     CJS require → 遍历面⑤；re-export 跨语句 → 遍历面②）
  //   · 4 条在 AST 下无独立变异（侧效应吞噬 / 后文字符串 from / 行尾注释含引号 / ES2022 绑定名）
  //     → 并入本条语料，不再单列为 🔒
  // ══════════════════════════════════════════════════════════════════
  it('📜 语料：正则时代六种漏抓/误捕形态在 AST 下的实际表现（无独立鉴别力，见上方注释）', () => {
    // (a) 侧效应 import 被后续 from-import 吞掉（原始版；`(?:...)?` 是贪婪可选）
    expect(importSpecifiers("import './runtime';\nimport { z } from 'zod';")).toEqual([
      './runtime',
      'zod',
    ]);
    // (b) 后文字符串里的 ` from ` 紧跟引号，同样触发吞噬（fix-4 修正过的那条死钉的真形态）
    expect(importSpecifiers("import './runtime';\nconst s = 'a from ' + 'b';")).toEqual([
      './runtime',
    ]);
    // (c) 多行 import 的行尾注释含引号/反引号/分号 → fix-3 版整条漏抓
    expect(importSpecifiers("import {\n  a, // 见 `runtime`\n} from './bt';")).toEqual(['./bt']);
    expect(importSpecifiers("import {\n  a, // it's fine\n} from './ap';")).toEqual(['./ap']);
    expect(importSpecifiers("import {\n  a, // foo; bar\n} from './sc';")).toEqual(['./sc']);
    // (d) ES2022 arbitrary module namespace names（合法语法，绑定区带引号）→ fix-3 版漏抓
    expect(importSpecifiers('import { "weird-name" as w, x } from "./es2022";')).toEqual([
      './es2022',
    ]);
    expect(importSpecifiers('export { x as "a-b" } from "./es2022x";')).toEqual(['./es2022x']);
    // (e) U1：行尾注释里写着旧路径 —— 正则版既误捕注释里的 './old'，又漏掉真的 './new'
    expect(importSpecifiers("import { a } from './new'; // 旧版 from './old'")).toEqual([
      './new',
    ]);
    // (f) U2：无分号的 export 语句 + 后文散文含 ` from '…'` —— fix-4 版会**凭空捏造** importer。
    //     这是本批立项的头号理由（BL-M51B-CARRYOVER 第 ② 组，当时靠 Prettier 强制分号才不可达）。
    const u2 = "export const a = 1\n// 说明：本模块的数据 from 'lib/db/privileged' 而来";
    expect(importSpecifiers(u2), 'U2 复发：凭空捏造了一个 importer').toEqual([]);
    // (g) 幻影块注释：行注释里的 `/*`（路由通配）曾让整个文件的 import 被吞
    //     （F003 实测于 src/app/api/auth/[...nextauth]/route.ts:1 的 `/api/auth/*`）
    expect(
      importSpecifiers(
        ['// M5 路由装配：/api/auth/*', "import { privilegedDb } from 'lib/db/privileged';"].join(
          '\n',
        ),
      ),
    ).toEqual(['lib/db/privileged']);
  });
});

/* ================================================================== *
 * M5.1b fix-1（F008 复发防线）— `src/lib/db/` 说明段的事实性陈述
 *
 * 【为什么加这一组】F008 的任务是「把两条失实注释改对」，它改完又在段尾写下
 * 「本段的 importer / 调用点类陈述现由 tests/unit/db-layer-importer-census.test.ts 机械守住」
 * —— 而这道钉的 GUARDED 只有 runtime 与 privileged 两个 **importer** 条目，从来不看
 * withTenant 调用点，也从不扫 tests/。于是那句话**写下的那一刻就是假的**：首轮验收实测，
 * 同一 HEAD 上「产品代码零 withTenant 调用点」已被 15 个反例证伪，而本文件 4 passed、
 * 全量 1869 passed 全绿 —— 一句为假的陈述加一个全绿的仓，等于全仓无一条断言在守它。
 *（两个独立 evaluator 各自查证到同一结论，对抗复核 0/3 证伪；
 *  docs/test-reports/M5.1b-verify-F001.md · M5.1b-verify-F002-F008.md · M5.1b-adversarial-F008.md）
 *
 * 【这一组守什么、不守什么】守的是「说明段不得再出现会漂的绝对句与计数」这条**规矩本身**：
 *   ① 政策句不得被删（正向，非空转 —— 删掉即红）
 *   ② 三条已被实测证伪的绝对句不得复活（负向黑名单，形态精确）
 *   ③ 说明段不得再写「N 处 withTenant 调用点」这类计数（负向模式）
 * **不守**「注释描述的设计语义是否正确」—— 那是人读代码的事，机械判据够不着，故不声称。
 *
 * 【变异证活（M5.1b fix-1 实跑，记录见 commit 正文）】
 *   · 删掉 tenant-scope.ts 里的政策句      → ① 红
 *   · 把「零 withTenant 调用点」写回说明段 → ② 红并点名该句
 *   · 在说明段写「产品代码 3 处 withTenant 调用点」→ ③ 红
 * ================================================================== */

const TENANT_SCOPE_FILE = 'src/lib/db/tenant-scope.ts';

/**
 * 首轮验收**逐条点名**的三条被证伪陈述（`docs/test-reports/M5.1b-verify-F002-F008.md` 与
 * `M5.1b-verify-F001.md` 各自独立点名，两份的三条一致）。
 *
 * 【为什么按「条」而不是按「字符串」组织 —— fix-2 的直接教训】
 * 上一版把三条拍平成三个字符串：`零 withTenant 调用点` / `没有嵌套守卫` / `不要嵌套调用`。
 * 数组恰好 3 条，看起来对得上「三条」，**实际上后两个同出首轮第 ③ 条**（原文那一句里
 * 既有「没有嵌套守卫」也有「不要嵌套调用」），于是第 ① 条「只交付单层语义」根本没人守 ——
 * 逐字写回说明段，全仓 1875 条全绿。复验与对抗复核用「同一行位置换成别的黑名单串则当场红」
 * 的对照排除了「扫描器没看见」这一反向解释（`M5.1b-adversarial-rv1-F008.md`）。
 * 现在改成 claim → patterns 的结构：条数取自 CLAIMS.length，不再由人另行数一遍。
 *
 * > fix-4 删除（用户裁决）：此处原接着写「声称的覆盖面与实际覆盖面由同一个数据结构产出，
 * > **不可能再对不上**」。该句已被 rv2 与 rv3 两轮各自实测证伪——把某条 claim 的 pattern
 * > 换成简繁形近字，条数仍是 3、每条仍有 pattern，而守护面实际缩水，🔒②b 一声不吭。
 * > 本组断言**不对自身覆盖面作任何承诺**：它守的就是下面这几条 pattern 能匹配到的东西，
 * > 仅此而已；已知绕过形态见本文件其余用例与「已知边界」段。
 */
const FALSIFIED_CLAIMS: ReadonlyArray<{ claim: string; patterns: readonly RegExp[] }> = [
  {
    claim: '① 本模块此刻只交付「单层」语义',
    // 允许中间夹 markdown 星号：`只交付**单层**语义`。刻意不匹配 `· 单层：开事务 →` 那种
    // 合法的语义清单行（那里没有「只交付」也没有「语义」紧跟）。
    patterns: [/只交付\W{0,4}单层\W{0,4}语义/],
  },
  {
    claim: '② 产品代码（src/）零 withTenant 调用点',
    patterns: [/零\s*withTenant\s*调用点/],
  },
  {
    claim: '③ 现在没有嵌套守卫 / F002 落地前不要嵌套调用',
    patterns: [/没有嵌套守卫/, /不要嵌套调用/],
  },
];

describe('src/lib/db 说明段的事实性陈述（M5.1b fix-1 立，fix-2 补射程）', () => {
  // 【fix-2 起扫描**整个文件**，不再只读开头的 // 块】
  // 复验实测：把三条被证伪句原样写进 withTenant 之前的 JSDoc（说明段之外 20 行处），
  // 上一版守护面看不见（8 passed 全绿）。守护面小于「这些话不该出现在本文件任何地方」
  // 这个意图，就还是「声称的覆盖面 > 实际覆盖面」——本组断言存在的理由正是消灭这一族。
  // 放宽的安全性已实测：三条 pattern 在当前文件的合法内容上零命中（讲教训那段一律改述）。
  const source = readFileSync(TENANT_SCOPE_FILE, 'utf8');

  it('扫描器不空转：文件确实读到了内容', () => {
    // 没有这条，下面的负向断言会在「source 恒为空串」时恒绿（F003 那道恒真闸门的同款形态）
    expect(source.length, `${TENANT_SCOPE_FILE} 读不到内容`).toBeGreaterThan(2000);
  });

  it('🔒 ① 「可变数字要么有钉守、要么不写」这条政策句不得被删', () => {
    expect(
      source,
      `${TENANT_SCOPE_FILE} 缺少那条政策句 —— 它是本组断言存在的理由，删了它这一组就成了无主之钉`,
    ).toContain('注释里的可变数字要么有钉守着，要么不写');
  });

  it('🔒 ② 首轮逐条点名的三条被证伪陈述，一条都不得复活', () => {
    const revived = FALSIFIED_CLAIMS.filter((c) =>
      c.patterns.some((re) => re.test(source)),
    ).map((c) => c.claim);
    expect(
      revived,
      `${TENANT_SCOPE_FILE} 复活了已被实测证伪的陈述：${revived.join(' / ')}`,
    ).toEqual([]);
  });

  it('🔒 ②b 覆盖面自洽：守的条数 = 首轮点名的条数（防「声称三条实际两条」复发）', () => {
    // 这一条守的是**上一版那个缺陷本身**：条数对不上时当场红，而不是等下一轮验收来发现。
    expect(
      FALSIFIED_CLAIMS.length,
      '首轮两份报告各自逐条点名的是三条陈述；CLAIMS 条数与之不符即说明覆盖面又缩了',
    ).toBe(3);
    for (const c of FALSIFIED_CLAIMS) {
      expect(c.patterns.length, `${c.claim} 没有任何 pattern —— 空条目等于没守`).toBeGreaterThan(0);
    }
  });

  it('🔒 ③ 不得再写「N 处 withTenant 调用点」这类会漂的计数', () => {
    // 正则要求计数紧邻「withTenant 调用点」，故讲教训那段的「批末实测 15 处 / 11 文件」
    // （其后不接该短语）不会误伤。
    const counting = [
      ...source.matchAll(/(\d+)\s*处\s*(?:\/\s*\d+\s*文件\s*)?withTenant\s*调用点/g),
    ].map((m) => m[0]);
    expect(
      counting,
      `${TENANT_SCOPE_FILE} 出现了未经钉守的 withTenant 调用点计数：${counting.join(' / ')}`,
    ).toEqual([]);
  });

  it('🔒 ④ 被守文件的注释只许指路，不许承诺本组的覆盖面（用户裁决，fix-3）', () => {
    // 【为什么这条从「射程写在产品注释里」改成「产品注释不许承诺」】
    // 同一族缺陷（声称的覆盖面 > 实际覆盖面）在本批复发三次，每次都发生在「为消灭它而写的
    // 那句话」里：F008 的「已由本钉守住」→ 假；fix-1 的「三条…不得复活」→ 实际两条；
    // fix-2 的「条数就是数据结构本身，不可能再对不上」→ 简繁形近字即可绕过。
    // 用户据此裁决：**注释只指向钉的位置，不承诺完备性**。射程与盲区的唯一权威位置是本文件。
    // 于是这条断言改为钉住那个「不承诺」的立场本身 —— 谁把承诺写回产品注释，这里就红。
    expect(
      source,
      'tenant-scope.ts 的注释必须明写「不对本组钉的覆盖面作承诺」并指向本文件',
    ).toContain('不对那组钉的覆盖面作任何承诺');

    // 反向：**现行叙述**里不得再出现承诺完备性的措辞。
    //
    // 【为什么要剔掉 `// >` 前缀行】那些是更正记录，职责就是**原文引用**被推翻的旧措辞
    //（「原来写的是 X，实测为假」）。把它们纳入黑名单等于要求历史记录不许提到历史 ——
    // 这与 F007 那道 doc-freshness 钉撞上验收报告是同一个结构冲突，沿用同一个处置先例
    //（那次把 docs/test-reports 与 docs/archive 剔出扫描面）。
    // **代价如实登记：** 有人若把新的过度声称写成 `// >` 开头，这条看不见。
    // 该风险可接受 —— `// >` 在本仓的既定用法就是引用/更正块；但它是本条的已知盲区。
    const currentNarrative = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('// >'))
      .join('\n');
    const overclaims = ['即红并点名', '不可能再对不上', '机械守住'].filter((p) =>
      currentNarrative.includes(p),
    );
    expect(
      overclaims,
      `tenant-scope.ts 的现行叙述里出现了承诺覆盖面的措辞：${overclaims.join(' / ')}`,
    ).toEqual([]);
  });
});
