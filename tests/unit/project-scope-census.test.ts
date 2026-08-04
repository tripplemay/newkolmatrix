// M4.8-HARDEN F003 — 三口径项目解析的**全仓普查钉**（防「新增解析点不带 tenantId」回流）
//
// 【它守的是什么】`prisma.project.findFirst({ where: { OR: [{id},{publicId},{slug}] } })`
// 是仓内复用了 6+ 次的口径（compute-health D8 先例）。projectId 一路来自客户端可控的
// `body.context.projectId`；这个 where 里少一个 tenantId，就是一处静默的跨租户读。
// M4.6 验收实测过它的后果：system 段吐出另一个租户的项目名。
//
// 【为什么与 F001/F002 的行为级测试不重叠（D-3 / M4.7 规律 2）】
// 行为级测试守的是「这两个函数现在的行为对不对」，普查钉守的是「以后新写的第三、第四处
// 解析点会不会又漏」。两层失效模式必须不重叠：**本文件的断言不从 F001/F002 的修复点
// 清单派生**——它自己扫全仓，任何新增的三口径解析点无需在任何清单里登记就会被扫到；
// 漏带 tenantId 即红。反过来，若哪天有人把 F001 的修复摘掉，本钉也会红（两层同时守）。
//
// 【为什么用 readFileSync 递归遍历而不是 git grep】`git grep` 只搜**已跟踪**文件，
// 新文件未 commit 时恒空绿（M4.5 building 期踩过，见 project-status.md 关键技术坑）。
//
// 【扫描口径】不只匹配 `prisma.project.findFirst`：仓内还有 `db.project.findFirst`、
// `(ctx.db ?? prisma).project.findFirst` 等写法（事务客户端 / 注入缝）。故按
// `.project.findFirst(` 匹配接收者无关的调用，再用**花括号配平**取出实参与 where ——
// 单行与多行格式（set-goal.ts 是多行 OR）走同一条路径，不靠正则去猜换行位置。
//
// 【范围】spec D-3 划定的是 `src/`。scripts/ 下唯一的 project.findFirst
//（scripts/test/m2a-f001-db-verify.ts:65）不是三口径解析，不在本钉范围——如实登记在此。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = 'src';

/**
 * 豁免清单 —— **恒为空，且写死在这里**。
 *
 * 要豁免任何一处三口径解析点，必须显式改这个数组并在旁边写明理由（跨租户读为什么
 * 是对的）。做成「改代码才能豁免」是刻意的：清单一旦可配置或可从别处推导，
 * 下一个漏带 tenantId 的解析点就会以「加进豁免」的形式静默通过。
 */
const EXEMPTIONS: ReadonlyArray<string> = [];

interface ResolveSite {
  /** `file:line`（line 指 `.project.findFirst(` 那一行）。 */
  at: string;
  /** where 子句里与 OR 同层是否有 tenantId。 */
  hasTenantId: boolean;
  /** OR 数组是否写成多行（先验活用：普查必须能命中多行格式）。 */
  multilineOr: boolean;
}

/**
 * 把注释与字符串/模板字面量的**内容**替换成等长空格。
 *
 * 目的：花括号配平与关键字匹配不该被注释里的 `}` 或字符串里的 `tenantId` 骗到，
 * 同时保持**偏移量不变**，这样行号仍能在原文上算出来。
 */
function maskSource(src: string): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        j += 1;
      }
      blank(i + 1, Math.min(j, src.length));
      i = Math.min(j + 1, src.length);
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** 从 open 处（`{` 或 `[`）取配平的整段，返回 [start, endExclusive]。 */
function balanced(masked: string, open: number): [number, number] | null {
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const close = pairs[masked[open]];
  if (!close) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === masked[open]) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return [open, i + 1];
    }
  }
  return null;
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i += 1) {
    if (src[i] === '\n') line += 1;
  }
  return line;
}

/**
 * 扫一份源码里的**三口径**（id + publicId + slug 同在一个 OR 数组）Project 解析点。
 *
 * 二口径 / 单口径（`where: { id, tenantId }` 之类）不在本钉范围——它们不是本缺陷的
 * 复用口径，且仓内现存的那些已逐个核过带 tenantId（spec D-3 附注登记在案）。
 */
export function scanProjectResolves(src: string, file: string): ResolveSite[] {
  const masked = maskSource(src);
  const sites: ResolveSite[] = [];
  const call = /\.project\s*\.\s*findFirst\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(masked)) !== null) {
    const argStart = masked.indexOf('{', m.index + m[0].length - 1);
    if (argStart === -1) continue;
    const argSpan = balanced(masked, argStart);
    if (!argSpan) continue;
    const arg = masked.slice(argSpan[0], argSpan[1]);
    const whereKey = /\bwhere\s*:\s*\{/.exec(arg);
    if (!whereKey) continue;
    const whereOpen = argSpan[0] + whereKey.index + whereKey[0].length - 1;
    const whereSpan = balanced(masked, whereOpen);
    if (!whereSpan) continue;
    const where = masked.slice(whereSpan[0], whereSpan[1]);

    const orKey = /\bOR\s*:\s*\[/.exec(where);
    if (!orKey) continue;
    const orOpen = whereSpan[0] + orKey.index + orKey[0].length - 1;
    const orSpan = balanced(masked, orOpen);
    if (!orSpan) continue;
    const or = masked.slice(orSpan[0], orSpan[1]);

    // 三口径判据：OR 数组里 id / publicId / slug 三个键齐全
    //（`{ id }` 简写与 `{ id: ref }` 都能认；`publicId` 不会被 \bid\b 误认）
    const threeWay =
      /(^|[{,\s])id\s*[:}]/.test(or) &&
      /(^|[{,\s])publicId\s*[:}]/.test(or) &&
      /(^|[{,\s])slug\s*[:}]/.test(or);
    if (!threeWay) continue;

    // 与 OR **同层**的 tenantId：把 OR 数组整段挖掉再找，
    // 这样「tenantId 写进 OR 里的某个分支」（等于没作用域）也会被判为缺失。
    const whereWithoutOr =
      where.slice(0, orSpan[0] - whereSpan[0]) +
      where.slice(orSpan[1] - whereSpan[0]);

    sites.push({
      at: `${file}:${lineOf(src, m.index)}`,
      hasTenantId: /\btenantId\b/.test(whereWithoutOr),
      multilineOr: or.includes('\n'),
    });
  }
  return sites;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk(ROOT);
const SITES = FILES.flatMap((f) => scanProjectResolves(readFileSync(f, 'utf8'), f));

describe('三口径项目解析普查（M4.8-HARDEN F003）', () => {
  it('src/ 下每一处三口径解析的 where 都与 OR 同层带 tenantId', () => {
    const offenders = SITES.filter(
      (s) => !s.hasTenantId && !EXEMPTIONS.includes(s.at),
    ).map((s) => s.at);
    expect(
      offenders,
      '三口径解析缺 tenantId = 跨租户读（projectId 是客户端可控的）。' +
        '收口方式见 src/lib/agent/project-context.ts:findProjectByRef',
    ).toEqual([]);
    expect(EXEMPTIONS, '豁免清单必须为空——要豁免请显式改断言并写明理由').toEqual(
      [],
    );
  });

  // ── 先验活：扫描器本身不许是死的 ────────────────────────────────────────
  // 一个「什么都扫不到」的扫描器会让上面那条恒绿。下面三条钉扫描器的活性。
  it('扫描器确实扫到了东西：≥8 处解析点，且覆盖 src/ 全树', () => {
    expect(FILES.length, 'src/ 下一个 ts/tsx 都没扫到 = 遍历坏了').toBeGreaterThan(
      100,
    );
    expect(
      SITES.length,
      '三口径解析点扫到 0 处 = 扫描器坏了（spec D-3 实物 ≥8 处）',
    ).toBeGreaterThanOrEqual(8);
  });

  it('多行 OR 格式必须能命中（set-goal.ts 是多行形态）', () => {
    const setGoal = SITES.filter((s) =>
      s.at.startsWith('src/lib/projects/set-goal.ts'),
    );
    expect(
      setGoal.length,
      'set-goal.ts 的多行 OR 没被扫到 = 扫描器只会认单行格式',
    ).toBe(1);
    expect(setGoal[0].multilineOr, '该处应被识别为多行 OR').toBe(true);
    expect(SITES.some((s) => s.multilineOr)).toBe(true);
    expect(
      SITES.some((s) => !s.multilineOr),
      '单行格式也得能扫到（campaigns/[id]/page.tsx 是单行）',
    ).toBe(true);
  });

  it('已收口的两处（F001 / F002）在普查里确实是「带 tenantId」', () => {
    // 【这不是从修复点清单派生断言】上面那条 offenders 断言完全不认识这两个文件；
    // 这条只是反过来证明扫描器对**已修好的**代码给出的是「合规」而不是恒判合规——
    // 若扫描器把所有点都判成 hasTenantId=true，第一条断言就永远绿。
    const pinned = [
      'src/lib/agent/project-context.ts',
      'src/lib/agent/knowledge-context.ts',
    ];
    for (const f of pinned) {
      const hit = SITES.filter((s) => s.at.startsWith(`${f}:`));
      expect(hit.length, `${f} 的三口径解析点没被扫到`).toBe(1);
      expect(hit[0].hasTenantId, `${f} 缺 tenantId`).toBe(true);
    }
  });

  // ── 扫描器的鉴别力：合成样本（永久版「临时加一处未收口点」变异）────────────
  // 变异实测时我真的往 src/ 里塞过单行与多行两种未收口写法（各一处），两次普查都红；
  // 但那种验证跑完就没了。下面用合成源码把同样的判据固化下来，
  // 使「扫描器退化成认不出违规写法」这件事本身会红。
  describe('扫描器鉴别力（合成样本）', () => {
    const cases: Array<[string, string, boolean]> = [
      [
        '单行 OR，无 tenantId → 违规',
        `await prisma.project.findFirst({ where: { OR: [{ id: r }, { publicId: r }, { slug: r }] } });`,
        false,
      ],
      [
        '多行 OR，无 tenantId → 违规',
        `await prisma.project.findFirst({
           where: {
             OR: [
               { id: r },
               { publicId: r },
               { slug: r },
             ],
           },
         });`,
        false,
      ],
      [
        'tenantId 藏在 OR 的某个分支里 → 仍算违规（那不是作用域）',
        `await prisma.project.findFirst({ where: { OR: [{ id: r, tenantId: t }, { publicId: r }, { slug: r }] } });`,
        false,
      ],
      [
        '单行 OR + 同层 tenantId → 合规',
        `await prisma.project.findFirst({ where: { tenantId: t, OR: [{ id: r }, { publicId: r }, { slug: r }] } });`,
        true,
      ],
      [
        '多行 OR + 同层 tenantId → 合规',
        `await prisma.project.findFirst({
           where: {
             tenantId,
             OR: [
               { id: r },
               { publicId: r },
               { slug: r },
             ],
           },
         });`,
        true,
      ],
      [
        '事务客户端接收者（db. / (ctx.db ?? prisma).）同样要被扫到',
        `await (ctx.db ?? prisma).project.findFirst({ where: { OR: [{ id: r }, { publicId: r }, { slug: r }] } });`,
        false,
      ],
    ];

    it.each(cases)('%s', (_label, src, expectedCompliant) => {
      const found = scanProjectResolves(src, 'synthetic.ts');
      expect(found.length, '合成样本没被识别为三口径解析点').toBe(1);
      expect(found[0].hasTenantId).toBe(expectedCompliant);
    });

    it('注释与字符串里的假样本不算数（不制造幽灵违规点）', () => {
      const src = `
        // await prisma.project.findFirst({ where: { OR: [{ id: r }, { publicId: r }, { slug: r }] } });
        const sql = "prisma.project.findFirst({ where: { OR: [{ id: r }, { publicId: r }, { slug: r }] } })";
      `;
      expect(scanProjectResolves(src, 'synthetic.ts')).toEqual([]);
    });

    it('非三口径（二口径 / 单口径）不进本钉范围', () => {
      const twoWay = `await prisma.project.findFirst({ where: { OR: [{ id: r }, { slug: r }] } });`;
      const single = `await prisma.project.findFirst({ where: { id: r } });`;
      expect(scanProjectResolves(twoWay, 'synthetic.ts')).toEqual([]);
      expect(scanProjectResolves(single, 'synthetic.ts')).toEqual([]);
    });
  });
});
