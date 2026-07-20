#!/usr/bin/env node
/**
 * FE-AUDIT F001 — 模板组件 × 项目使用状态矩阵（可复跑）
 *
 * 产出四类分类：used-as-is / forked-modified / re-implemented(需人工判定) / unused
 * 判定口径：
 *   - 路径存在性：项目 src/components/<p> 与模板 src/components/<p> 同路径比对
 *   - 内容同一性：逐字节 diff（相同 → used-as-is 候选；不同 → forked-modified）
 *   - 活性：从 src/app/** 出发做传递可达性分析（import 图），不可达 = unused（死代码）
 *     ——只看「有没有被 import」会误判：被死组件 import 的组件仍是死的。
 *
 * 用法：
 *   node scripts/test/fe-audit-component-matrix.mjs [模板根路径]
 *   默认模板根：~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main
 *
 * 退出码恒为 0（审计工具，不做门禁）。
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const SRC = 'src';
const TPL_DEFAULT = path.join(
  os.homedir(),
  'project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main',
);
const TPL = process.argv[2] || TPL_DEFAULT;
const TPL_COMPONENTS = path.join(TPL, 'src/components');

const norm = (s) => s.replace(/\\/g, '/');
const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : [p];
      })
    : [];

// ---------- 1. 传递可达性（活性） ----------
const allSrc = walk(SRC).filter((f) => /\.(tsx|ts)$/.test(f)).map(norm);

function resolveSpec(spec, fromFile) {
  const base = spec.startsWith('.')
    ? norm(path.join(path.dirname(fromFile), spec))
    : norm(path.join(SRC, spec)); // tsconfig baseUrl=src
  for (const c of [base + '.tsx', base + '.ts', base + '/index.tsx', base + '/index.ts']) {
    if (fs.existsSync(c)) return norm(c);
  }
  return null;
}

function importsOf(f) {
  const txt = fs.readFileSync(f, 'utf8');
  const out = new Set();
  const re = /from\s+'([^']+)'|import\('([^']+)'\)|require\('([^']+)'\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const r = resolveSpec(m[1] || m[2] || m[3], f);
    if (r) out.add(r);
  }
  return [...out];
}

const entries = allSrc.filter((f) => f.startsWith('src/app/'));
const reachable = new Set();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const d of importsOf(f)) if (!reachable.has(d)) stack.push(d);
}

// ---------- 2. 模板 / 项目组件清单 ----------
const projComponents = allSrc
  .filter((f) => f.startsWith('src/components/') && f.endsWith('.tsx'))
  .map((f) => f.replace('src/components/', ''));

const tplComponents = walk(TPL_COMPONENTS)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => norm(f).replace(norm(TPL_COMPONENTS) + '/', ''));

if (tplComponents.length === 0) {
  console.error(`[WARN] 模板目录为空或不存在：${TPL_COMPONENTS}`);
  console.error('       传入正确的模板根路径作为第一个参数后重跑。');
}

const bucket = {
  'used-as-is': [],
  'forked-modified': [],
  'unused(dead-in-repo)': [],
  'unused(never-ported)': [],
  'removed(whitelist)': [],
  'self-built(not-in-template)': [],
};

for (const rel of tplComponents) {
  const projPath = `src/components/${rel}`;
  if (!fs.existsSync(projPath)) {
    // 模板有、项目无
    (rel.startsWith('map/') ? bucket['removed(whitelist)'] : bucket['unused(never-ported)']).push(rel);
    continue;
  }
  const same =
    fs.readFileSync(path.join(TPL_COMPONENTS, rel), 'utf8') ===
    fs.readFileSync(projPath, 'utf8');
  const alive = reachable.has(projPath);
  if (!alive) bucket['unused(dead-in-repo)'].push(rel);
  else if (same) bucket['used-as-is'].push(rel);
  else bucket['forked-modified'].push(rel);
}

const tplSet = new Set(tplComponents);
for (const rel of projComponents) {
  if (!tplSet.has(rel)) bucket['self-built(not-in-template)'].push(rel);
}

// ---------- 3. 输出 ----------
console.log('FE-AUDIT F001 — 模板组件 × 项目使用状态矩阵');
console.log('模板根：', TPL);
console.log('模板组件 tsx：', tplComponents.length, '| 项目组件 tsx：', projComponents.length);
console.log('src/app 入口文件：', entries.length, '| 可达文件总数：', reachable.size);
console.log('');
for (const [k, v] of Object.entries(bucket)) {
  console.log(`== ${k}: ${v.length}`);
  v.sort().forEach((f) => console.log('   ', f));
  console.log('');
}
console.log('注：re-implemented（模板已提供却手写重复实现）无法纯静态判定，');
console.log('    须人工比对页面 inline 标记 —— 见报告 §4 的逐条 文件:行 证据。');
