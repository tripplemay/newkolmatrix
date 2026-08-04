// M5-AUTH-RLS F001 — 401/403 语义钉（spec D-1 + architecture.md:1450）。
//
// 背景：本仓在无认证时期把 **403 锁死为闸门语义**（GATE_TOKEN_INVALID / webhook fail-closed）。
// M5 引入认证后，「认证失败」必须恒 401，绝不许借用 403——否则 UI 与运维再也无法从状态码
// 分辨「你没登录」和「AI 越过了人确认闸门」。
//
// 断言形态：对 src/app + src/lib 做**代码级 403 普查**（剥注释后计数），与已知白名单逐项对账。
// 任何新增 403 都会让这里红，必须由人显式决定是否该进白名单——这正是「要放宽必须改断言」。
//
// 变异对照：在任一 route 里加一句 `status: 403` → 本文件红。

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const SCAN_ROOTS = ['src/app', 'src/lib'];

/** 剥注释：块注释整段去掉；行注释去掉（`https://` 这类不误伤）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      const idx = line.search(/(^|[^:])\/\//);
      return idx < 0 ? line : line.slice(0, idx);
    })
    .join('\n');
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(p);
  }
  return acc;
}

function censusOf(pattern: RegExp, roots: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const hits = stripComments(readFileSync(file, 'utf8')).match(pattern);
      if (hits) out[file.slice(REPO_ROOT.length + 1)] = hits.length;
    }
  }
  return out;
}

/**
 * 403 白名单 = 闸门语义 + webhook fail-closed + 外部 API 入站状态处理。
 * **认证面一个都不许有**（认证失败恒 401）。
 */
const EXPECTED_403_CENSUS: Record<string, number> = {
  // 闸门：未确认先执行 → GATE_TOKEN_INVALID（M3-A 两步票据）
  'src/app/api/actions/[id]/execute/route.ts': 1,
  // webhook fail-closed：取不到客户端 IP 即拒（M3-A F004）
  'src/app/api/signals/inbound/route.ts': 1,
  // 闸门分码表（GateErrorCode → HTTP status）
  'src/lib/agent/gate/gate.ts': 3,
  // 外部 apify 服务**入站**状态归类（401/403 → auth 终态，不是我方发出的 403）
  'src/lib/apify/client.ts': 1,
};

describe('M5-AUTH-RLS F001 — 403 闸门语义未被认证面借用', () => {
  it('全仓代码级 403 普查恰等于白名单（新增 403 必须先改这条断言）', () => {
    expect(censusOf(/\b403\b/g, SCAN_ROOTS)).toEqual(EXPECTED_403_CENSUS);
  });

  it('认证面（lib/auth · api/auth · middleware）零 403', () => {
    const authCensus = censusOf(/\b403\b/g, [
      'src/lib/auth',
      'src/app/api/auth',
    ]);
    expect(authCensus).toEqual({});

    const middlewarePath = join(REPO_ROOT, 'src/middleware.ts');
    if (existsSync(middlewarePath)) {
      const code = stripComments(readFileSync(middlewarePath, 'utf8'));
      expect(code.match(/\b403\b/g)).toBeNull();
    }
  });
});
