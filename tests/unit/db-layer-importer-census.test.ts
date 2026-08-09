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

/** 取文件开头的整块行注释（第一行非 `//` 即止）—— 说明段就在这里。 */
function leadingLineComment(source: string): string {
  const out: string[] = [];
  for (const line of source.split('\n')) {
    if (line.startsWith('//')) out.push(line);
    else if (line.trim() === '') continue;
    else break;
  }
  return out.join('\n');
}

describe('src/lib/db 说明段的事实性陈述（M5.1b fix-1：F008 复发防线）', () => {
  const header = leadingLineComment(readFileSync(TENANT_SCOPE_FILE, 'utf8'));

  it('扫描器不空转：说明段确实取到了内容', () => {
    // 没有这条，下面两条负向断言会在「header 恒为空串」时恒绿（F003 那道恒真闸门的同款形态）
    expect(header.length, `${TENANT_SCOPE_FILE} 的开头行注释块取不到内容`).toBeGreaterThan(500);
  });

  it('🔒 ① 「可变数字要么有钉守、要么不写」这条政策句不得被删', () => {
    expect(
      header,
      `${TENANT_SCOPE_FILE} 说明段缺少那条政策句 —— 它是本组断言存在的理由，删了它这一组就成了无主之钉`,
    ).toContain('注释里的可变数字要么有钉守着，要么不写');
  });

  it('🔒 ② 已被实测证伪的绝对句不得复活', () => {
    // 形态取自首轮验收逐条点名的原文（docs/test-reports/M5.1b-verify-F002-F008.md）
    const falsified = [
      '零 withTenant 调用点',
      '没有嵌套守卫',
      '不要嵌套调用',
    ];
    const revived = falsified.filter((s) => header.includes(s));
    expect(
      revived,
      `${TENANT_SCOPE_FILE} 说明段复活了已被实测证伪的绝对句：${revived.join(' / ')}`,
    ).toEqual([]);
  });

  it('🔒 ③ 说明段不得再写「N 处 withTenant 调用点」这类会漂的计数', () => {
    // 允许叙述历史（「批末实测 15 处 / 11 文件」出现在讲教训的那段，带明确的过去时语境）；
    // 禁止的是把计数写成**当下事实**的那种形态：紧邻 withTenant 调用点的裸计数断言。
    const counting = [...header.matchAll(/(\d+)\s*处\s*(?:\/\s*\d+\s*文件\s*)?withTenant\s*调用点/g)]
      .map((m) => m[0])
      .filter((s) => !header.includes(`批末实测 ${s}`));
    expect(
      counting,
      `${TENANT_SCOPE_FILE} 说明段出现了未经钉守的 withTenant 调用点计数：${counting.join(' / ')}`,
    ).toEqual([]);
  });
});
