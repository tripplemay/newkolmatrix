/**
 * M5.1c rv1 回归 · 探针 P1：新增探针文件是否污染「入口普查」的扫描面/计数。
 * 只读；不写任何仓库文件。
 */
import { execFileSync } from 'node:child_process';

const out = execFileSync(
  'npx',
  ['tsx', '-e', `
    import { runCensus } from './scripts/test/m51b-entrypoint-census.ts';
    const c = runCensus();
    console.log('TOTAL=' + c.entries.length + ' COVERED=' + c.covered.length);
    const hits = c.entries.filter(e => /m51c|rv1b|probe-bench|f001-mutations/i.test(e.file));
    console.log('M51C_IN_CENSUS=' + hits.length);
    for (const h of hits) console.log('  HIT ' + h.file);
    const scriptEntries = c.entries.filter(e => e.kind === 'script').map(e => e.file).sort();
    console.log('SCRIPT_ENTRIES=' + scriptEntries.length);
  `],
  { encoding: 'utf8', cwd: process.cwd() },
);
console.log(out.trim());

// 活性自测：把一个已知在场的入口文件名拿去匹配，证明「HIT 检测」不是恒空
const live = execFileSync(
  'npx',
  ['tsx', '-e', `
    import { runCensus } from './scripts/test/m51b-entrypoint-census.ts';
    const c = runCensus();
    const probe = c.entries.filter(e => /route\\.ts$/.test(e.file));
    console.log('SELFTEST_positive_route_ts=' + probe.length + ' (须 >0，否则匹配器本身是死的)');
  `],
  { encoding: 'utf8', cwd: process.cwd() },
);
console.log(live.trim());
