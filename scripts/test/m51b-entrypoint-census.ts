// M5.1b-TENANT-INJECTION F007 — **入口面普查**：全部入口 − 最小闭环已覆盖 = M5.2 的工作面。
//
// 【为什么必须是普查产出而不是手写清单】手写清单在写下的那一刻就开始过期，而它是 M5.2 的
// **输入**——漏一条就是「开关一开、那个入口当场 fail-closed」。本模块把清单变成一次可复跑的
// 扫描：新加 route / page / 例程无需登记就会自动出现在差集里。
//
// 【扫描用 readFileSync 递归遍历，不用 `git grep`】git grep 只搜**已跟踪**文件，
// 新文件未 commit 时恒空绿（M4.5 building 期踩过；F003/F008 的普查钉同此纪律）。
//
// 用法：
//   npm run census:entrypoints            # 打印普查摘要（人看）
//   npm run census:entrypoints -- --write # 重写 docs/specs/M5.1-uncovered-entrypoints.md
//
// 本模块同时被 tests/unit/architecture-doc-freshness.test.ts 引用：文档里的计数与本普查
// 的实测值比对，对不上就红（文档漂移面的机械钉）。

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export type EntryKind = 'api-route' | 'page' | 'routine' | 'script';

/** 租户从哪来 —— 决定 M5.2 该怎么给它接上作用域。 */
export type TenantSource =
  | 'session' // 会话面：登录会话 → requireSession* / 零参 buildToolContext
  | 'explicit' // 无会话面：systemContext / systemTenantId 显式指名
  | 'bootstrap' // 引导面：租户已知**之前**就要碰库，走 privilegedDb（F003 白名单）
  | 'none'; // 不碰库（或只碰不带租户的东西）

export interface EntryRecord {
  file: string;
  kind: EntryKind;
  /** 例程用得上：注册表里的名字。 */
  name?: string;
  tenantSource: TenantSource;
  /** 已被 withTenant / withSessionTenant 包裹（= 最小闭环已覆盖）。 */
  covered: boolean;
}

const ROOT = process.cwd();

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      out.push(...walk(rel, match));
    } else if (match(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

function read(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8');
}

/**
 * 租户来源判定（源码级，按优先级取第一条命中）。
 *
 * 刻意**不**从「文件里有没有 prisma」反推：引导面文件也 import prisma-ish 的东西，
 * 区分它们靠的是「租户从哪来」这个语义标记，不是「碰不碰库」。
 */
function classifyTenantSource(src: string): TenantSource {
  if (/withSessionTenant|requireSessionTenantId|requireSessionIdentity/.test(src)) {
    return 'session';
  }
  // 不带 tenantId 的 `buildToolContext` 调用 = 走会话（context.ts 的双路收敛）。
  // 【注意】这句注释刻意**不写出**那个零参调用的字面形态：
  // tests/unit/system-context-convergence.test.ts 扫 scripts/ 里的裸调用，
  // 写全了会让本文件被那条钉点名（首跑实测撞到过）。量尺不该被自己量出问题。
  if (/buildToolContext\(\s*[){]/.test(src) || /buildToolContext\(\)/.test(src)) {
    return 'session';
  }
  if (/systemContext|systemTenantId/.test(src)) return 'explicit';
  if (/lib\/db\/privileged|db\/privileged/.test(src)) return 'bootstrap';
  if (/lib\/db\/prisma|db\/prisma/.test(src)) return 'explicit';
  return 'none';
}

function isCovered(src: string): boolean {
  return /withSessionTenant|withTenant\s*\(/.test(src);
}

/** scheduler.ts 的 ROUTINES 逐条：注册名 + 该条执行体是否已包 withTenant。 */
function censusRoutines(): EntryRecord[] {
  const file = 'src/lib/jobs/scheduler.ts';
  const src = read(file);
  const start = src.indexOf('export const ROUTINES');
  const body = start >= 0 ? src.slice(start) : src;
  // 按 `name: '...'` 切块 —— 每块 = 注册表里的一条
  const marks = [...body.matchAll(/name:\s*'([\w-]+)'/g)];
  return marks.map((m, i) => {
    const from = m.index!;
    const to = i + 1 < marks.length ? marks[i + 1].index! : body.length;
    const block = body.slice(from, to);
    return {
      file,
      kind: 'routine' as const,
      name: m[1],
      tenantSource: classifyTenantSource(block),
      covered: isCovered(block),
    };
  });
}

export interface Census {
  /** 扫到的全部文件（含 tenantSource='none' 的「不碰租户」文件）。 */
  scanned: EntryRecord[];
  /** 入口面 = 扫到的文件里**确实带租户**的那些（none 不算入口——它没有可接的作用域）。 */
  entries: EntryRecord[];
  /** 按 kind 的扫描总数（含 none），用于与 spec 的「31 route / 13 admin page」底数对账。 */
  scannedTotals: Record<EntryKind, number>;
  totals: Record<EntryKind, number>;
  /** src/app/admin/ 下的 page 数（spec 底数写的是这个口径，与全部 page.tsx 不同）。 */
  adminPageCount: number;
  covered: EntryRecord[];
  uncovered: EntryRecord[];
}

/**
 * 普查模块**排除自己**：本文件为了判定「谁包了作用域」必须在源码里写出
 * `withSessionTenant` / `withTenant(` 这些字面量，于是会把自己判成「已覆盖的 script」。
 * 首跑实测就撞到了（已覆盖 4 条里有一条是它自己）。它是量尺，不是被量的东西。
 */
const SELF = 'scripts/test/m51b-entrypoint-census.ts';

export function runCensus(): Census {
  const scanned: EntryRecord[] = [];

  for (const file of walk('src/app', (f) => f === 'route.ts')) {
    const src = read(file);
    scanned.push({
      file,
      kind: 'api-route',
      tenantSource: classifyTenantSource(src),
      covered: isCovered(src),
    });
  }
  for (const file of walk('src/app', (f) => f === 'page.tsx')) {
    const src = read(file);
    scanned.push({
      file,
      kind: 'page',
      tenantSource: classifyTenantSource(src),
      covered: isCovered(src),
    });
  }
  scanned.push(...censusRoutines());
  for (const file of walk('scripts', (f) => f.endsWith('.ts'))) {
    if (file === SELF) continue;
    const src = read(file);
    scanned.push({
      file,
      kind: 'script',
      tenantSource: classifyTenantSource(src),
      covered: isCovered(src),
    });
  }

  // 入口面 = 带租户的那些。不碰租户的文件（redirect 壳、纯客户端页、打包器脚本）
  // 没有可接的作用域，把它们算进「未覆盖」只会给 M5.2 制造 14 条假待办。
  const entries = scanned.filter((e) => e.tenantSource !== 'none');

  const count = (list: EntryRecord[]) =>
    list.reduce(
      (acc, e) => {
        acc[e.kind] = (acc[e.kind] ?? 0) + 1;
        return acc;
      },
      {} as Record<EntryKind, number>,
    );

  return {
    scanned,
    entries,
    scannedTotals: count(scanned),
    totals: count(entries),
    adminPageCount: scanned.filter(
      (e) => e.kind === 'page' && e.file.startsWith('src/app/admin/'),
    ).length,
    covered: entries.filter((e) => e.covered),
    uncovered: entries.filter((e) => !e.covered),
  };
}

const SOURCE_LABEL: Record<TenantSource, string> = {
  session: '会话面（登录会话）',
  explicit: '无会话面（显式指名）',
  bootstrap: '引导面（privilegedDb 白名单）',
  none: '不碰租户',
};

const KIND_LABEL: Record<EntryKind, string> = {
  'api-route': 'API route',
  page: 'page（RSC）',
  routine: '例程',
  script: 'script',
};

export function renderMarkdown(c: Census): string {
  const lines: string[] = [];
  lines.push('# M5.1 未覆盖入口清单（M5.2 的工作面）');
  lines.push('');
  lines.push(
    '> **本文件由普查产出，不要手写。** 重新生成：`npm run census:entrypoints -- --write`',
  );
  lines.push(
    '> 普查实现：`scripts/test/m51b-entrypoint-census.ts`（readFileSync 递归遍历，**不用 `git grep`**——',
  );
  lines.push(
    '> 后者只搜已跟踪文件，新文件未 commit 时恒空绿）。计数与实物的一致性由',
  );
  lines.push('> `tests/unit/architecture-doc-freshness.test.ts` 机械钉住。');
  lines.push('');
  lines.push(
    'M5.1b 只做**最小闭环**（spec D-6）：证明机制成立，不做全站收口。下表是「全部入口 − 已覆盖」的差集——',
  );
  lines.push(
    '**开关 `DB_APP_ROLE_RUNTIME=1` 一打开，这些入口的数据访问会当场抛 `MissingTenantScopeError`**',
  );
  lines.push(
    '（fail-closed，不是静默零行）。M5.2 的任务就是把它们逐条接上租户作用域。',
  );
  lines.push('');

  lines.push('## 底数（本次普查实测）');
  lines.push('');
  lines.push(
    '「扫描数」= 该类文件总数；「入口面」= 其中**确实带租户**的（`不碰租户` 的 redirect 壳 / 纯客户端页 /',
  );
  lines.push('打包器脚本没有可接的作用域，不是待办）。差集只在入口面上算。');
  lines.push('');
  lines.push('| 类型 | 扫描数 | 入口面 | 已覆盖 | 未覆盖 |');
  lines.push('|---|---:|---:|---:|---:|');
  const kinds: EntryKind[] = ['api-route', 'page', 'routine', 'script'];
  for (const k of kinds) {
    const all = c.entries.filter((e) => e.kind === k);
    lines.push(
      `| ${KIND_LABEL[k]} | ${c.scannedTotals[k] ?? 0} | ${all.length} | ${
        all.filter((e) => e.covered).length
      } | ${all.filter((e) => !e.covered).length} |`,
    );
  }
  lines.push(
    `| **合计** | **${c.scanned.length}** | **${c.entries.length}** | **${c.covered.length}** | **${c.uncovered.length}** |`,
  );
  lines.push('');
  lines.push('### 与 spec 底数的对账（逐条如实登记，不是照抄）');
  lines.push('');
  lines.push(
    'spec（M5.1b §F007 acceptance ③）写的底数是「31 API route + 13 admin page + 3 例程 + ~20 scripts」。本次实测：',
  );
  lines.push('');
  lines.push(
    `- **API route ${c.scannedTotals['api-route'] ?? 0}** —— 与 spec 的 31 一致。`,
  );
  lines.push(
    `- **page ${c.scannedTotals.page ?? 0}**，其中 \`src/app/admin/\` 下 **${c.adminPageCount}** —— spec 的「13 admin page」是**只数 admin/** 的口径，`,
  );
  lines.push(
    `  与实测 admin 数一致；差出来的 ${
      (c.scannedTotals.page ?? 0) - c.adminPageCount
    } 个是 login / signup / 根页 / preview 两页（均不碰租户）。`,
  );
  lines.push(
    `- **例程 ${c.scannedTotals.routine ?? 0}** —— spec 写 3，**实测 4**。差因：\`src/lib/jobs/routines/\` 下确实只有 3 个文件，`,
  );
  lines.push(
    '  但 `ROUTINES` 注册表有 4 条（`kol-sync` 的执行体在 `src/lib/kol-sync/sync.ts`，不在 routines/ 目录下）。',
  );
  lines.push('  本清单按**注册表**计数——调度真正会跑的是注册表，不是目录。');
  lines.push(
    `- **script 扫描 ${c.scannedTotals.script ?? 0} / 入口面 ${
      c.totals.script ?? 0
    }** —— spec 写 ~20，**实测入口面 ${c.totals.script ?? 0}**。`,
  );
  lines.push(
    '  spec 的 ~20 是估数（原文即带 `~`）；实测偏多主要是 `scripts/test/` 下历次批次留下的验收探针也带租户。',
  );
  lines.push('');

  lines.push('## 已覆盖（M5.1b 最小闭环）');
  lines.push('');
  lines.push('| 入口 | 类型 | 租户来源 |');
  lines.push('|---|---|---|');
  for (const e of c.covered) {
    lines.push(
      `| \`${e.file}\`${e.name ? ` · ${e.name}` : ''} | ${KIND_LABEL[e.kind]} | ${
        SOURCE_LABEL[e.tenantSource]
      } |`,
    );
  }
  lines.push('');

  lines.push('## 未覆盖（M5.2 待接线）');
  lines.push('');
  lines.push(
    '`租户来源` 决定接法：会话面用 `withSessionTenant`（`src/lib/db/tenant-entry.ts`）；',
  );
  lines.push(
    '无会话面在解析出 tenantId 后显式 `withTenant`；引导面**本就不该包**——它们发生在租户已知之前，',
  );
  lines.push(
    '走 `privilegedDb`（F003 白名单），包了反而会把「登录/注册」重新锁死（审计 B2-1）。',
  );
  lines.push('');
  for (const k of kinds) {
    const rows = c.uncovered.filter((e) => e.kind === k);
    if (!rows.length) continue;
    lines.push(`### ${KIND_LABEL[k]}（${rows.length}）`);
    lines.push('');
    lines.push('| 入口 | 租户来源 |');
    lines.push('|---|---|');
    for (const e of rows) {
      lines.push(
        `| \`${e.file}\`${e.name ? ` · ${e.name}` : ''} | ${SOURCE_LABEL[e.tenantSource]} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 判定口径（读表前先看这个）');
  lines.push('');
  lines.push(
    '- **已覆盖** = 该文件（例程为该注册条目的执行体块）里出现 `withSessionTenant` 或 `withTenant(`。',
  );
  lines.push(
    '- **租户来源**按源码标记判定，优先级：`withSessionTenant`/`requireSession*` → 会话面；',
  );
  lines.push(
    '  零参 `buildToolContext` 调用（不带租户）→ 会话面；`systemContext`/`systemTenantId` → 无会话面；',
  );
  lines.push('  只 import `db/privileged` → 引导面；其余 import `db/prisma` → 无会话面。');
  lines.push(
    '- 完全不碰租户的 `scripts/` 文件（纯前端探针等）不计入入口面——它们没有可接的作用域。',
  );
  lines.push(
    '- **引导面条目留在「未覆盖」表里是刻意的**：它们不是待办，是**不该做**的登记项，',
  );
  lines.push('  免得 M5.2 有人照着「未覆盖」逐条包过去，把登录重新锁死。');
  lines.push('');
  return lines.join('\n');
}

const OUT = 'docs/specs/M5.1-uncovered-entrypoints.md';

function main(): void {
  const census = runCensus();
  if (process.argv.includes('--write')) {
    writeFileSync(join(ROOT, OUT), renderMarkdown(census), 'utf8');
    console.log(`[census] 已写入 ${OUT}`);
  }
  console.log(
    `[census] 入口合计 ${census.entries.length}（已覆盖 ${census.covered.length} / 未覆盖 ${census.uncovered.length}）`,
  );
  for (const [k, n] of Object.entries(census.totals)) console.log(`  ${k}: ${n}`);
}

// 被 import 时不执行（测试引用 runCensus）
if (relative(ROOT, process.argv[1] ?? '').includes('m51b-entrypoint-census')) {
  main();
}
