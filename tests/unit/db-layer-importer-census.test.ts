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
// 已知边界（如实登记）：**字符串拼接出来的动态路径**（`import('./' + name)`）扫不到 ——
// 这条无解于正则层面，要堵得上 AST。本仓 db 层无此写法（见文件末的活性证明）。
// > fix-3 更正：上一版这里只登记了拼接路径一条，给人「其余都覆盖」的印象。实测另有两种
// > **真实 import 语法**当时也漏抓（侧效应 import 后跟 from-import；反引号动态 import），
// > 二者已修并配回归用例。教训：已知边界清单本身也会「声称的覆盖面 > 实际覆盖面」——
// > 它只是「已经想到并验过的」，不等于「其余全都抓得到」。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, posix } from 'node:path';
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
 * 剥掉注释，避免把「注释里提到的模块路径」当成 import（假阳性①）。
 *
 * 【顺序要紧：必须先剥行注释，再剥块注释】F003 实测踩中——
 * `src/app/api/auth/[...nextauth]/route.ts:1` 的行注释里写着路由通配 `/api/auth/*`，
 * 其中 `/*` 两个字符会开启一个**幻影块注释**；若先剥块注释，它会一路吃到 :30 的
 * `/** … *​/` 才闭合，把中间**全部 import 连同代码**一起吞掉 —— 该文件于是在本钉里
 * 恒为「无 import」，钉对它恒盲。这类形态（路由通配、glob、URL）在本仓很常见。
 * 倒过来先剥行注释就不会：那一行整行消失，`/*` 随之消失。
 *
 * 行注释只剥**整行**（首个非空白字符是 `//`），故 `const u = 'https://x'` 这类
 * 字符串里的 `//` 不受影响。
 */
function stripComments(source: string): string {
  const withoutLineComments = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 只认三种真实 import 语法，不按标识符名匹配（避开假阳性②）。 */
function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specs: string[] = [];
  // 【M5.1b fix-3：三条 pattern 均已修，原因是实测漏抓，不是防御性调整】
  //   · 静态/侧效应：原写 `(?:[\s\S]*?\sfrom\s+)?`。`(?:...)?` 是**贪婪**可选（不是 `??`），
  //     所以它先尝试匹配一次，内部惰性 `[\s\S]*?` 便**跨行**去找下一条语句的 ` from `，
  //     把侧效应 specifier 连同 import 关键字一起吞掉。实测：
  //       `import './runtime';` 单独一行 → 抓到；其后再跟任意一条 from-import → **漏**。
  //     改法：把 from 之前的区域限制成不含引号与分号，跨不过语句边界（仍允许换行，
  //     因为 `import {\n a,\n} from 'x'` 是合法写法）。
  //   · 动态：原只认 ['"]，反引号**静态**路径 `import(\`../db/runtime\`)` 漏抓 ——
  //     而 src/instrumentation.ts 现在就在用动态 import 引 db 层模块。已补反引号。
  //   · re-export：同一贪婪可选形态，一并按同样口径收紧。
  //   · CJS `require()`：对抗复核额外点出的未覆盖形态。本仓是 ESM、src/ 下当前零使用，
  //     属「登记面缺口而非当下的洞」——但按本批新口径（注释只指路，钉的边界段是唯一权威），
  //     能覆盖就不留登记，故直接补上而不是写进已知边界。
  // 三条的漏抓与修复后行为均由文件末「活性证明」里的回归用例钉住（fix-3 新增）。
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"`]([^'"`]+)['"`]/g, // static / side-effect
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // dynamic
    /\bexport\s+[^'"`;]*?\sfrom\s+['"`]([^'"`]+)['"`]/g, // re-export
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // CJS require（fix-3 补，见下）
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

    // ④ **回归**：行注释里的 `/*`（路由通配 / glob / URL）不得开启幻影块注释而吞掉后续 import。
    //    这不是假想形态——F003 实测踩中 src/app/api/auth/[...nextauth]/route.ts:1 的
    //    `/api/auth/*`，当时（先剥块注释）该文件全部 import 被吞，钉对它恒盲。
    const phantom = [
      '// M5 路由装配：/api/auth/*',
      "import { privilegedDb } from 'lib/db/privileged';",
      '/** 正常块注释 */',
    ].join('\n');
    expect(importSpecifiers(phantom)).toContain('lib/db/privileged');

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

  // ══════════════════════════════════════════════════════════════════
  // fix-3 回归：两种**真实 import 语法**曾经漏抓，这里逐条钉住
  //
  // 来源：M5.1b 第二次复验实测（docs/test-reports/M5.1b-rv2-F008-F001.md）。
  // 当时 runtime.ts 的文件头写着「新增 importer 即红并点名」，而这两种形态下钉全绿 ——
  // 即那句话为假。修 pattern 的同时把两种形态钉成回归用例，避免下次改正则又静默漏回去。
  // ══════════════════════════════════════════════════════════════════
  it('🔒 回归：侧效应 import 后跟 from-import，两个 specifier 都要抓到', () => {
    // 曾经的错法：`(?:[\s\S]*?\sfrom\s+)?` 是**贪婪**可选，内部惰性跨行找到下一条语句的
    // ` from `，把侧效应那条连同 import 关键字一起吞掉 —— 实测只得到 ['zod']。
    const code = ["import './runtime';", "import { z } from 'zod';"].join('\n');
    const specs = importSpecifiers(code);
    expect(specs, '侧效应 specifier 被后续 from-import 吞掉了').toContain('./runtime');
    expect(specs).toContain('zod');

    // 顺序反过来（曾经能抓到）也必须继续抓到——防止修法把另一头改瞎
    const reversed = ["import { z } from 'zod';", "import './runtime';"].join('\n');
    expect(importSpecifiers(reversed)).toEqual(
      expect.arrayContaining(['zod', './runtime']),
    );

    // 多行 import 仍须成立（收紧字符集时最容易误伤的合法写法）
    expect(
      importSpecifiers("import {\n  a,\n  b,\n} from './multi';"),
    ).toContain('./multi');
  });

  it('🔒 回归：反引号静态路径的动态 import 要抓到', () => {
    // src/instrumentation.ts 现在就在用动态 import 引 db 层模块；原 pattern 只认 ['"]，
    // 反引号写法整条看不见。
    expect(
      importSpecifiers('const m = await import(`../db/runtime`);'),
    ).toContain('../db/runtime');
    // 单引号（原本就抓得到）不得因修法而回退
    expect(
      importSpecifiers("const m = await import('../db/runtime');"),
    ).toContain('../db/runtime');
  });

  it('🔒 回归：CJS require 与「后文任意字符串含 from」两种形态', () => {
    // 前者是对抗复核额外点出的未覆盖形态（本仓 ESM、当前零使用，属预防）；
    // 后者是它对逃逸条件的加宽：不必是 from-import，**文件后文任意位置**出现 ` from `
    // （哪怕在一个普通字符串里）就足以触发原来的吞噬。
    expect(importSpecifiers("const m = require('./runtime');")).toContain('./runtime');
    expect(
      importSpecifiers("import './runtime';\nconst s = 'a from b';"),
      '后文普通字符串里的 from 又把侧效应 specifier 吞掉了',
    ).toContain('./runtime');
  });

  it('🔒 已登记边界仍如实：字符串拼接的动态路径确实抓不到（不是声称，是实测）', () => {
    // 这一条**故意断言「抓不到」**：已知边界要有实测支撑，否则「已登记」也会变成空话。
    expect(importSpecifiers("const m = await import('./' + name);")).toEqual([]);
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
 * 现在改成 claim → patterns 的结构：**条数就是 CLAIMS.length**，声称的覆盖面与实际覆盖面
 * 由同一个数据结构产出，不可能再对不上。
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
