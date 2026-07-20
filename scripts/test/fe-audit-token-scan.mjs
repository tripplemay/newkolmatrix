#!/usr/bin/env node
/**
 * FE-AUDIT F003 — 设计系统一致性扫描（tokens / 样式偏离）
 *
 * 用法：
 *   node scripts/test/fe-audit-token-scan.mjs                 # 人读报告
 *   node scripts/test/fe-audit-token-scan.mjs --json          # 机读 JSON
 *   node scripts/test/fe-audit-token-scan.mjs --all           # 含 template-inherited 文件（默认排除）
 *   TEMPLATE_ROOT=/path/to/horizon node scripts/test/fe-audit-token-scan.mjs
 *
 * 设计要点（为什么不是「全仓 grep hex」）：
 * 项目 174 个 ts/tsx 中 115 个与 Horizon UI Pro 3.0.0 模板原件**逐字节相同**。
 * 对这些文件报「偏离」= 报模板自己的写法 = 噪音。本脚本先按模板基线分类：
 *   identical → 模板原件，不计 finding
 *   forked    → 仅审计「项目引入的新增行」（模板原有行不计）
 *   new       → 项目自写，全量审计
 * 所有「偏离」判定的对照口径**来自模板实测词表**（见 TEMPLATE_VOCAB），
 * 而不是脚本作者的审美，避免引入 spec 之外的隐式门槛（FE-AUDIT-spec §4 D7）。
 *
 * 退出码：始终 0（审计工具，不是 CI 门禁；FE-AUDIT 不修改产品代码）
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { homedir } from 'node:os';

const REPO = process.cwd();
const TEMPLATE_ROOT =
  process.env.TEMPLATE_ROOT ||
  join(
    homedir(),
    'project',
    'db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0',
    'horizon-tailwind-react-nextjs-pro-main',
  );

const ARGS = new Set(process.argv.slice(2));
const AS_JSON = ARGS.has('--json');
const INCLUDE_ALL = ARGS.has('--all');

/* ------------------------------------------------------------------ *
 * 基线口径（全部来自模板实测，命令见报告「复核方法」）
 * ------------------------------------------------------------------ */
const TEMPLATE_VOCAB = {
  // 模板 src 全域实测：shadow-sm/md 0 次；shadow-lg 仅 others/buttons demo 页 21 次；
  // 生产用法 = shadow-3xl / shadow-shadow-100 / shadow-shadow-500 / shadow-xl / shadow-2xl / shadow-none
  shadowAllowed: new Set([
    '3xl', 'xl', '2xl', 'none', 'inset', 'darkinset',
    'shadow-100', 'shadow-500', 'brand-500',
  ]),
  // 模板 src 全域实测：无任何 text-[Npx] 小于 15px（最小 text-[15px]）
  minArbitraryFontPx: 15,
  // horizon-tokens.md §6：次要文本 = gray-600 / gray-700（模板 gray-600 用了 408 次，gray-500 仅 7 次）
  canonicalMutedText: new Set(['gray-600', 'gray-700']),
};

// 合法字族（horizon-tokens.md §4）
const ALLOWED_FONTS = [/DM\s*Sans/i, /Poppins/i];

/* ------------------------------------------------------------------ *
 * 豁免（每条都附理由 + 依据，可审计）
 * ------------------------------------------------------------------ */
const EXEMPT_FILES = {
  'src/app/AppWrappers.tsx':
    'token 定义源本身（horizon-tokens.md §1/§2 指定的品牌色阶注入点），此处 hex 即 token 定义，非偏离',
  'src/app/preview/agent-canvas/page.tsx':
    '确定性视觉基线夹具页，文件头自述「浅色，独立路由，保证像素确定」，供 tests/visual 截图；' +
    '刻意不写 dark: 与不复用外壳，dark 完整性/表面 token 不适用',
};

// spec §4 D6 白名单
const D6_WHITELIST = [
  'map/ 组件已删（Mapbox token 硬编码，v1.0.4 secret 预扫规则）',
  'Chakra 仅保留零散原语（CLAUDE.md 既定架构）',
  '默认浅色（DS-FOUNDATION F002 用户拍板）',
  'rtl/ rtlProvider/ 未使用标 unused，不算债',
];

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p);
  }
  return out;
}

function classify(relPath) {
  const tpl = join(TEMPLATE_ROOT, relPath);
  if (!existsSync(tpl)) return { kind: 'new', tplPath: null };
  const a = readFileSync(join(REPO, relPath), 'utf8');
  const b = readFileSync(tpl, 'utf8');
  return { kind: a === b ? 'identical' : 'forked', tplPath: tpl };
}

/** forked 文件：返回模板中不存在的行号集合（= 项目引入的行） */
function projectIntroducedLines(relPath, tplPath) {
  const cur = readFileSync(join(REPO, relPath), 'utf8').split('\n');
  const tplLines = new Set(
    readFileSync(tplPath, 'utf8')
      .split('\n')
      .map((l) => l.trim()),
  );
  const s = new Set();
  cur.forEach((l, i) => {
    if (!tplLines.has(l.trim())) s.add(i + 1);
  });
  return s;
}

/** 提取 className 字符串里的 utility token（处理 !important、变体前缀、透明度后缀） */
function classTokens(line) {
  const out = [];
  for (const m of line.matchAll(/[\w:!/[\]().%-]+/g)) {
    const raw = m[0];
    if (!/^[a-z0-9:!/[\]().%-]+$/i.test(raw)) continue;
    out.push(raw);
  }
  return out;
}

function splitVariants(token) {
  // dark:hover:!bg-white/10 → { variants:['dark','hover'], base:'bg-white', bang:true, alpha:'10' }
  const parts = token.split(':');
  const base0 = parts.pop() || '';
  const variants = parts;
  const bang = base0.startsWith('!');
  let base = bang ? base0.slice(1) : base0;
  let alpha = null;
  const am = base.match(/^(.*?)\/([0-9.]+)$/);
  if (am) {
    base = am[1];
    alpha = am[2];
  }
  return { variants, base, bang, alpha };
}

/* ------------------------------------------------------------------ *
 * 检查项
 * ------------------------------------------------------------------ */
const findings = [];
function add(f) {
  findings.push(f);
}

function checkHardcodedColor(rel, lineNo, line) {
  for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    add({
      check: 'hardcoded-color',
      severity: 'P1',
      file: rel,
      line: lineNo,
      found: m[0],
      expected:
        'Tailwind token（brand-*/navy-*/gray-*/horizon*-*）或 CSS 变量 var(--color-*)；见 horizon-tokens.md §1-§3',
      snippet: line.trim().slice(0, 120),
    });
  }
  for (const m of line.matchAll(/\b(rgba?|hsla?)\([^)]*\)/g)) {
    add({
      check: 'hardcoded-color',
      severity: 'P1',
      file: rel,
      line: lineNo,
      found: m[0],
      expected: 'Tailwind token 或 var(--shadow-100) 等既有 CSS 变量',
      snippet: line.trim().slice(0, 120),
    });
  }
}

function checkFont(rel, lineNo, line) {
  for (const m of line.matchAll(/font-family\s*:\s*([^;'"}\n]+)/gi)) {
    const fam = m[1].trim();
    if (/inherit|initial|unset|var\(/i.test(fam)) continue;
    if (!ALLOWED_FONTS.some((re) => re.test(fam))) {
      add({
        check: 'font-family',
        severity: 'P1',
        file: rel,
        line: lineNo,
        found: fam,
        expected: "DM Sans（font-dm，正文）或 Poppins（font-poppins，标题）；horizon-tokens.md §4",
        snippet: line.trim().slice(0, 120),
      });
    }
  }
  for (const t of classTokens(line)) {
    const { base } = splitVariants(t);
    const m = base.match(/^font-\[(.+)\]$/);
    if (m && !ALLOWED_FONTS.some((re) => re.test(m[1]))) {
      add({
        check: 'font-family',
        severity: 'P1',
        file: rel,
        line: lineNo,
        found: base,
        expected: 'font-dm / font-poppins',
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

function checkShadow(rel, lineNo, line) {
  for (const t of classTokens(line)) {
    const { base } = splitVariants(t);
    if (!base.startsWith('shadow-')) continue;
    const val = base.slice('shadow-'.length);
    if (/^\[.*\]$/.test(val)) {
      add({
        check: 'shadow',
        severity: 'P2',
        file: rel,
        line: lineNo,
        found: base,
        expected: 'tailwind.config.js boxShadow 既有刻度（shadow-3xl / inset / darkinset）+ shadow-shadow-100/500 上色',
        snippet: line.trim().slice(0, 120),
      });
      continue;
    }
    // 上色类（shadow-shadow-100 / shadow-brand-500 等）跳过
    if (/^(shadow|brand|navy|gray|white|black|horizon[A-Za-z]+)-/.test(val)) continue;
    if (!TEMPLATE_VOCAB.shadowAllowed.has(val)) {
      add({
        check: 'shadow',
        severity: 'P2',
        file: rel,
        line: lineNo,
        found: base,
        expected:
          '模板生产词表：shadow-3xl + shadow-shadow-100/500（卡片）/ shadow-xl / shadow-2xl / shadow-none；' +
          'horizon-tokens.md §5。模板 src 全域 shadow-sm/md 出现 0 次',
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

function checkTypeScale(rel, lineNo, line) {
  for (const t of classTokens(line)) {
    const { base } = splitVariants(t);
    const m = base.match(/^text-\[(\d+)px\]$/);
    if (!m) continue;
    const px = Number(m[1]);
    if (px < TEMPLATE_VOCAB.minArbitraryFontPx) {
      add({
        check: 'type-scale',
        severity: 'P2',
        file: rel,
        line: lineNo,
        found: base,
        expected:
          `Tailwind 刻度 text-xs(12px)/text-sm(14px)，或模板既有 text-[15px]+；` +
          `模板 src 全域最小 arbitrary 字号 = ${TEMPLATE_VOCAB.minArbitraryFontPx}px，项目新造 <12px 微排版刻度`,
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

function checkMutedText(rel, lineNo, line) {
  for (const t of classTokens(line)) {
    const { variants, base } = splitVariants(t);
    if (variants.length) continue; // 只看基础态
    if (base === 'text-gray-500') {
      add({
        check: 'muted-text-token',
        severity: 'P2',
        file: rel,
        line: lineNo,
        found: base,
        expected:
          'text-gray-600（horizon-tokens.md §6 次要文本；模板 gray-600 用 408 次 vs gray-500 仅 7 次）',
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

/** 表面色 dark: 配对（只查真正需要配对的表面，不查 gray 文本——模板 text-gray-600 从不配 dark:） */
const SURFACE_NEEDS_DARK = [
  { re: /^bg-white$/, pair: /^bg-/, hint: 'dark:bg-navy-800 / dark:bg-navy-700' },
  { re: /^bg-gray-(50|100|200)$/, pair: /^bg-/, hint: 'dark:bg-navy-900 / dark:bg-navy-800' },
  { re: /^border-gray-(100|200|300)$/, pair: /^border-/, hint: 'dark:border-white/10' },
];

function checkDarkPairing(rel, lineNo, line) {
  const toks = classTokens(line).map(splitVariants);
  for (const rule of SURFACE_NEEDS_DARK) {
    const hasBase = toks.some(
      (t) => t.variants.length === 0 && rule.re.test(t.base) && t.alpha === null,
    );
    if (!hasBase) continue;
    const hasDark = toks.some(
      (t) => t.variants.includes('dark') && rule.pair.test(t.base),
    );
    if (!hasDark) {
      const found = toks.find(
        (t) => t.variants.length === 0 && rule.re.test(t.base),
      );
      add({
        check: 'dark-pairing',
        severity: 'P1',
        file: rel,
        line: lineNo,
        found: found.base,
        expected: `同元素补 ${rule.hint}（horizon-tokens.md §6「写组件时用 X dark:Y 双写保证深色回归」）`,
        snippet: line.trim().slice(0, 120),
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
if (!existsSync(TEMPLATE_ROOT)) {
  console.error(`[FATAL] 模板基线不存在：${TEMPLATE_ROOT}`);
  console.error('用 TEMPLATE_ROOT=<path> 指定 Horizon UI Pro 3.0.0 原件目录。');
  process.exit(2);
}

const files = walk(join(REPO, 'src')).map((p) => relative(REPO, p).split(sep).join('/'));
const stats = { identical: 0, forked: 0, new: 0, scanned: 0, exempt: 0 };
const scannedList = [];

for (const rel of files.sort()) {
  const { kind, tplPath } = classify(rel);
  stats[kind]++;

  if (kind === 'identical' && !INCLUDE_ALL) continue;
  if (EXEMPT_FILES[rel] && !INCLUDE_ALL) {
    stats.exempt++;
    continue;
  }
  // 非 UI 层（API 路由 / 服务端 lib）不参与样式审计
  if (/^src\/(app\/api|lib)\//.test(rel)) continue;

  const introduced =
    kind === 'forked' && tplPath ? projectIntroducedLines(rel, tplPath) : null;

  const lines = readFileSync(join(REPO, rel), 'utf8').split('\n');
  stats.scanned++;
  scannedList.push({ file: rel, kind });

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    // forked 文件只审计项目引入的行（模板原有行 = 模板的写法，不计 finding）
    if (introduced && !introduced.has(lineNo)) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // 注释行

    checkHardcodedColor(rel, lineNo, line);
    checkFont(rel, lineNo, line);
    checkShadow(rel, lineNo, line);
    checkTypeScale(rel, lineNo, line);
    checkMutedText(rel, lineNo, line);
    checkDarkPairing(rel, lineNo, line);
  });
}

const byCheck = {};
for (const f of findings) {
  (byCheck[f.check] ||= []).push(f);
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { generatedAt: new Date().toISOString(), templateRoot: TEMPLATE_ROOT, stats, byCheck, findings, exemptions: EXEMPT_FILES, d6Whitelist: D6_WHITELIST },
      null,
      2,
    ),
  );
} else {
  const L = (s = '') => console.log(s);
  L('FE-AUDIT F003 — 设计系统一致性扫描');
  L('='.repeat(64));
  L(`模板基线   : ${TEMPLATE_ROOT}`);
  L(`文件分类   : identical(模板原件) ${stats.identical} · forked ${stats.forked} · new(项目自写) ${stats.new}`);
  L(`实际扫描   : ${stats.scanned} 个文件（identical 默认跳过；--all 可全扫）`);
  L(`豁免       : ${stats.exempt} 个（见下方 EXEMPTIONS）`);
  L('');
  const order = ['hardcoded-color', 'font-family', 'dark-pairing', 'shadow', 'type-scale', 'muted-text-token'];
  for (const c of order) {
    const items = byCheck[c] || [];
    L(`── ${c} : ${items.length} 处 ─────────────────────`);
    if (!items.length) L('   （无）');
    for (const f of items) {
      L(`   [${f.severity}] ${f.file}:${f.line}  «${f.found}»`);
      L(`        应为: ${f.expected}`);
    }
    L('');
  }
  L('EXEMPTIONS（豁免文件及理由）');
  for (const [k, v] of Object.entries(EXEMPT_FILES)) L(`   - ${k}\n     ↳ ${v}`);
  L('');
  L('spec §4 D6 白名单（不计 finding）');
  for (const w of D6_WHITELIST) L(`   - ${w}`);
  L('');
  L(`合计 findings: ${findings.length}`);
}
