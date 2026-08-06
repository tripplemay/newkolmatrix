// M5-DEPLOY-FIX 验收产物（Evaluator，独立实现，**不复用被测扫描器**）—— env 键普查。
//
// 目的：回答两个被测断言自己回答不了的问题
//   ① 全面性：src/ 里读到的 env 键**全集**是多少？被测断言只覆盖其中哪些？
//      （被测断言的判据是「文件内同时有 `NODE_ENV === 'production'` 字面比较 + throw」，
//        本脚本用更宽的判据「文件提到 production 或 throw」做对照，量出覆盖差）
//   ② 反向风险：compose app 段透传了哪些 src/ 根本不读的键（冗余），
//      以及 src/ 读了但 compose 没透传的键（潜在缺口，未必都该红）。
//
// 用法：node scripts/test/m5-deploy-fix-env-census.mjs
// 只读，不修改任何文件。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const COMPOSE = join(ROOT, 'docker-compose.prod.yml');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

// 正则口径（刻意与被测的 AST 口径不同，交叉验证用）：process.env.X / process.env['X'] / env.X / env['X']
const READ_RE = /(?:process\.env|processEnv|(?<![A-Za-z0-9_.])env)\s*(?:\.\s*([A-Z][A-Z0-9_]*)|\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\])/g;

const byKey = new Map(); // key -> { files:Set, strictFailFast:boolean, looseFailFast:boolean }
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const strict =
    /NODE_ENV\s*={2,3}\s*['"`]production['"`]|['"`]production['"`]\s*={2,3}\s*(?:process\.)?env\.NODE_ENV/.test(
      text,
    ) && /\bthrow\b/.test(text);
  // 宽口径：提到 production（任意形态，含 !==、helper、字符串比较）且有 throw
  const loose = /production/.test(text) && /\bthrow\b/.test(text);
  for (const m of text.matchAll(READ_RE)) {
    const key = m[1] ?? m[2];
    if (!key || key === 'NODE_ENV') continue;
    const rec = byKey.get(key) ?? {
      files: new Set(),
      strict: false,
      loose: false,
    };
    rec.files.add(rel);
    rec.strict ||= strict;
    rec.loose ||= loose;
    byKey.set(key, rec);
  }
}

// compose app.environment 解析（独立实现：找 app: 块内 environment: 列表）
const composeText = readFileSync(COMPOSE, 'utf8');
const appEnvKeys = new Set();
{
  const lines = composeText.split('\n');
  let inApp = false;
  let inEnv = false;
  for (const line of lines) {
    if (/^\s{2}app:\s*$/.test(line)) {
      inApp = true;
      continue;
    }
    if (inApp && /^\s{2}\S/.test(line)) inApp = false;
    if (!inApp) continue;
    if (/^\s{4}environment:\s*$/.test(line)) {
      inEnv = true;
      continue;
    }
    if (inEnv && /^\s{4}\S/.test(line)) inEnv = false;
    if (!inEnv) continue;
    const m = line.trim().match(/^-\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m) appEnvKeys.add(m[1]);
  }
}

const sorted = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b));
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

console.log(`compose app.environment 透传键 (${appEnvKeys.size}): ${[...appEnvKeys].join(', ')}\n`);
console.log(
  `${pad('KEY', 30)}${pad('严格判据', 10)}${pad('宽判据', 8)}${pad('compose', 9)}来源文件`,
);
console.log('-'.repeat(120));
for (const [key, rec] of sorted) {
  console.log(
    `${pad(key, 30)}${pad(rec.strict ? 'HIT' : '-', 10)}${pad(rec.loose ? 'hit' : '-', 8)}${pad(
      appEnvKeys.has(key) ? 'yes' : 'NO',
      9,
    )}${[...rec.files].slice(0, 3).join(' ')}`,
  );
}

const strictKeys = sorted.filter(([, r]) => r.strict).map(([k]) => k);
const looseOnly = sorted.filter(([, r]) => r.loose && !r.strict).map(([k]) => k);
const missingInCompose = sorted.filter(([k]) => !appEnvKeys.has(k)).map(([k]) => k);
const composeOnly = [...appEnvKeys].filter((k) => !byKey.has(k) && k !== 'NODE_ENV');

console.log('\n── 汇总 ──');
console.log(`src/ 读到的 env 键总数: ${sorted.length}`);
console.log(`严格判据（被测断言口径）命中: ${strictKeys.length} → ${strictKeys.join(', ')}`);
console.log(`仅宽判据命中（被测断言看不见的 production+throw 文件里的键）: ${looseOnly.length}`);
console.log(`  ${looseOnly.join(', ')}`);
console.log(`src/ 读到但 compose app 未透传: ${missingInCompose.length}`);
console.log(`  ${missingInCompose.join(', ')}`);
console.log(`compose 透传但 src/ 不读（冗余/由脚本或框架消费）: ${composeOnly.join(', ')}`);
