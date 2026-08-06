// M5-DEPLOY-FIX F001 — 源码的 production fail-fast env 契约 ⇄ docker-compose.prod.yml 一致性。
//
// 【修的是什么】M5-AUTH-RLS 给 src/lib/auth/config.ts 加了刻意的 fail-fast：production 下缺
// AUTH_SECRET 就抛错，绝不回落到公开的 dev 常量（回落 = 任何人都能自签会话 cookie）。
// 但 docker-compose.prod.yml 的 app 服务从来没有透传过这个键。照现状部署的实际后果：
// src/middleware.ts:36 在 edge 模块作用域调 resolveAuthSecret()（请求时求值）→ 每个请求抛错；
// matcher 是「默认全拦」，/api/health 也在其中 → compose healthcheck 永远拿不到 200 →
// deploy-prod.yml 的 `up -d --wait` 超时失败，而旧容器此时已被 recreate。生产从 healthy 变 down。
//
// 【三轮验收为什么没抓到】部署配置不在任何执行面上：vitest 只收 tests/**，CI 只跑 lint/tsc/vitest，
// compose 文件要到 VPS 上 `docker compose up` 才被解析。缺的不是"更仔细的人"，是"这条边没被机器走过"。
// 本文件把 compose 拉进 vitest 收集范围，让这类不一致在 CI 当场翻红。
//
// 【修复前后对比（回归测试的意义）】
//   修复前：compose app 段无 AUTH_SECRET 行 → 「AUTH_SECRET 已透传」用例红（实测）
//   修复后：`- AUTH_SECRET=${AUTH_SECRET:?...}` → 该用例 + 形态用例双绿
//
// 【扫描口径（为什么它抓得住将来新增的键）】
// 键名不硬编码。用 TypeScript AST 扫 src/ 下每个 .ts/.tsx：
//   文件内同时存在 ①`NODE_ENV === 'production'` 比较 与 ②`throw` 语句
//   → 判定该文件属「production fail-fast 面」→ 收集该文件读到的全部 env 键
//     （process.env.X / process.env['X'] / 形参名为 env 的 env.X / 从 env 解构）。
// 判定单元取**文件**而非函数，是刻意从宽：常见写法是「模块顶层 const 读 env + 函数里 production 抛错」，
// 函数级作用域会漏掉它。从宽的代价是少量误判，由下面三张**显式清单**逐条消化——
// 每张清单的每个条目都带一条自己的断言（不是单纯的"跳过"），且有防腐用例钉住条目不许过期。
//
// 【本文件不做什么】不校验 compose 的其他键（DATABASE_URL / 端口 / 卷 / 网络）。
// 那是另一个量级的工程，且大多数键缺失时的表现是"当场报错"而非"静默失守"，不属本次根因面。

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const COMPOSE_PATH = join(REPO_ROOT, 'docker-compose.prod.yml');

// ── 例外清单 ①：compose 直接写死字面值的键（不来自 .env 插值，故不适用 `:?` 形态要求）
const COMPOSE_LITERAL_KEYS: Record<string, string> = {
  // 运行模式本身由 compose 钉死为 production（`- NODE_ENV=production`）；
  // 它是被判定的对象，不是要从 .env 注入的密钥。下方有专门用例钉住这个字面值。
  NODE_ENV: 'compose 写死 `NODE_ENV=production`，非插值键',
};

// ── 例外清单 ②：dev/CI 专用键，生产 compose **本就不该有**（断言方向是"必须缺席"）
const PROD_FORBIDDEN_KEYS: Record<string, string> = {
  // src/lib/auth/dev-seed.ts：dev 测试用户是**已知公开凭据**，assertDevSeedAllowed 在
  // NODE_ENV=production 下一律抛错、无 escape hatch，prod seed 也不建这个用户。
  // 这两个键出现在生产 compose 里只可能意味着有人想在生产建后门账号 → 该红。
  DEV_TEST_USER_EMAIL: 'dev/CI 专用公开凭据，生产禁建（dev-seed.assertDevSeedAllowed）',
  DEV_TEST_USER_PASSWORD: 'dev/CI 专用公开凭据，生产禁建（dev-seed.assertDevSeedAllowed）',
};

// ── 例外清单 ③：必须透传、但**刻意可选**（`:-`）的键——缺键不阻断部署，由应用层在用到的
//    时刻 fail-fast。默认策略仍是必填 `:?`；进这张清单需要写明"为什么缺了也能起"。
const OPTIONAL_BY_DESIGN_KEYS: Record<string, string> = {
  // src/lib/ops/email/index.ts：缺 key 时生产**拒发**（不静默 mock），但这只影响触达域一条链路；
  // 用 `:?` 会让整站部署被一个邮件密钥卡住。错误留在有明确语义的层（发送时刻），是 M3-A 的既定选择
  // （docker-compose.prod.yml 该键上方注释 + docs/dev/deploy.md M3-A 前置段均已成文）。
  RESEND_API_KEY: '缺 key 只影响触达域，发送时刻应用层拒发（M3-A P4 既定选择）',
};

/** env 键名形态：全大写 + 数字 + 下划线（用于把 `env.someFlag` 这类非 env-key 访问排除掉）。 */
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]*$/;

// ────────────────────────────────── src/ 扫描 ──────────────────────────────────

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listSourceFiles(p));
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

/** 这个表达式是不是「env 容器」：`process.env`，或名为 env / processEnv 的标识符（形参默认值那种）。 */
function isEnvObject(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      node.name.text === 'env'
    );
  }
  if (ts.isIdentifier(node)) {
    return node.text.toLowerCase() === 'env' || node.text === 'processEnv';
  }
  return false;
}

/** 该节点是否是一次 env 读取；是则返回键名。覆盖 `env.X` 与 `env['X']` 两种写法。 */
function envKeyOf(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) {
    return ENV_KEY_RE.test(node.name.text) ? node.name.text : null;
  }
  if (
    ts.isElementAccessExpression(node) &&
    isEnvObject(node.expression) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    const key = node.argumentExpression.text;
    return ENV_KEY_RE.test(key) ? key : null;
  }
  return null;
}

/** `NODE_ENV === 'production'`（含 `'production' === NODE_ENV` 与 `==`）。`!==` 刻意不算。 */
function isProductionCheck(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  const op = node.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsToken
  ) {
    return false;
  }
  const sides = [node.left, node.right];
  return (
    sides.some((s) => envKeyOf(s) === 'NODE_ENV') &&
    sides.some((s) => ts.isStringLiteralLike(s) && s.text === 'production')
  );
}

export interface FailFastKey {
  key: string;
  /** 命中该键的源文件（仓库相对路径），供失败信息点名。 */
  sources: string[];
}

/** 扫 src/ → production fail-fast 面上读到的 env 键（键名 → 来源文件）。 */
function scanProductionFailFastEnvKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of listSourceFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    // 先做廉价预筛：判定必须命中字面量 'production'，没有这个词的文件不可能是 fail-fast 面。
    if (!text.includes('production')) continue;

    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    let hasProductionCheck = false;
    let hasThrow = false;
    const keys = new Set<string>();

    const walk = (node: ts.Node): void => {
      if (isProductionCheck(node)) hasProductionCheck = true;
      if (ts.isThrowStatement(node)) hasThrow = true;

      const key = envKeyOf(node);
      if (key) keys.add(key);

      // `const { AUTH_SECRET } = process.env` 形态的解构读取。
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        isEnvObject(node.initializer) &&
        ts.isObjectBindingPattern(node.name)
      ) {
        for (const el of node.name.elements) {
          const nameNode = el.propertyName ?? el.name;
          if (ts.isIdentifier(nameNode) && ENV_KEY_RE.test(nameNode.text)) {
            keys.add(nameNode.text);
          }
        }
      }

      ts.forEachChild(node, walk);
    };
    walk(sourceFile);

    if (!hasProductionCheck || !hasThrow) continue;
    const rel = relative(REPO_ROOT, file);
    for (const key of keys) {
      found.set(key, [...(found.get(key) ?? []), rel]);
    }
  }
  return found;
}

// ───────────────────────────── docker-compose 解析 ─────────────────────────────

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** 取「以 headerIdx 行为头」的块（缩进严格大于头行的后续行）。 */
function blockLines(lines: string[], headerIdx: number): string[] {
  const headerIndent = indentOf(lines[headerIdx]);
  const out: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    if (indentOf(line) <= headerIndent) break;
    out.push(line);
  }
  return out;
}

function requireIdx(lines: string[], re: RegExp, what: string): number {
  const idx = lines.findIndex((l) => re.test(l));
  if (idx === -1) {
    // 解析不到就当场炸，绝不返回空 Map——空 Map 会让下面所有透传断言"无键可查"地假绿。
    throw new Error(`[deploy-env] docker-compose.prod.yml 解析失败：找不到 ${what}`);
  }
  return idx;
}

/** 解析指定 service 的 environment 段 → 键 → 原始值（不做变量插值，保留 `${X:?...}` 原文）。 */
function parseComposeServiceEnv(text: string, service: string): Map<string, string> {
  const lines = text.split('\n');
  const services = blockLines(lines, requireIdx(lines, /^services:\s*$/, '顶层 services:'));
  const serviceRe = new RegExp(`^\\s+${service}:\\s*$`);
  const svc = blockLines(services, requireIdx(services, serviceRe, `服务 ${service}:`));
  const env = blockLines(
    svc,
    requireIdx(svc, /^\s+environment:\s*$/, `${service}.environment:`),
  );

  const out = new Map<string, string>();
  for (const line of env) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // 列表形态 `- KEY=VALUE` / 列表简写 `- KEY`（继承宿主变量）/ 映射形态 `KEY: VALUE`
    const list = trimmed.match(/^-\s*([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/);
    if (list) {
      out.set(list[1], list[2] ?? '');
      continue;
    }
    const map = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (map) out.set(map[1], map[2]);
  }
  return out;
}

// ─────────────────────────────────── 断言 ───────────────────────────────────

const composeText = readFileSync(COMPOSE_PATH, 'utf8');
const appEnv = parseComposeServiceEnv(composeText, 'app');
const failFast = scanProductionFailFastEnvKeys();

const detected = [...failFast.keys()].sort();
/** 默认策略面：既非字面值、又非 dev 专用、又未声明"刻意可选"的 fail-fast 键 → 必须必填插值。 */
const requiredKeys = detected.filter(
  (k) =>
    !(k in COMPOSE_LITERAL_KEYS) &&
    !(k in PROD_FORBIDDEN_KEYS) &&
    !(k in OPTIONAL_BY_DESIGN_KEYS),
);
const sourcesOf = (key: string): string => (failFast.get(key) ?? []).join(', ');

describe('部署配置一致性：production fail-fast env 键必须在 compose app 服务透传', () => {
  // ── 探针验活（防"扫描器/解析器静默失效 → 全绿"这类假绿） ──
  it('扫描器验活：命中 AUTH_SECRET，且来源含 src/lib/auth/config.ts', () => {
    expect(
      detected,
      `扫描器一个 production fail-fast 键都没命中，说明它已失效（改过 src/ 目录结构？换过写法？）。` +
        `此时下面所有"透传"断言都会无键可查地假绿。`,
    ).toContain('AUTH_SECRET');
    expect(failFast.get('AUTH_SECRET')).toContain('src/lib/auth/config.ts');
  });

  it('compose 解析验活：app 服务 environment 段解出既有关键键', () => {
    for (const known of ['NODE_ENV', 'DATABASE_URL', 'AIGCGATEWAY_API_KEY']) {
      expect(
        [...appEnv.keys()],
        `compose app 服务的 environment 段没解出 ${known}——解析器已失效，` +
          `此时"某键没透传"与"解析器坏了"无法区分。`,
      ).toContain(known);
    }
  });

  // ── 主断言：逐键透传（键来自扫描，不是硬编码清单） ──
  for (const key of requiredKeys) {
    it(`${key} 已透传到 compose app 服务（源：${sourcesOf(key)}）`, () => {
      expect(
        [...appEnv.keys()],
        `${sourcesOf(key)} 在 production 下缺 ${key} 即抛错，但 docker-compose.prod.yml 的 ` +
          `app 服务没有透传它 → 部署即故障。修法：app.environment 加一行 ` +
          `\`- ${key}=\${${key}:?${key} 必填（放 /opt/apps/newkolmatrix/.env）}\`；` +
          `若该键属 dev 专用或刻意可选，把它登记进本文件顶部对应清单并写明理由。`,
      ).toContain(key);
    });

    it(`${key} 用必填插值形态 \${${key}:?...}（缺键在 compose 层报错，不等容器崩）`, () => {
      const value = appEnv.get(key) ?? '';
      expect(
        value,
        `${key} 的插值形态不是必填。可选形态（\${${key}:-}）在缺键时会注入空串，` +
          `故障点被推迟到运行时抛错（容器起来了却每个请求 500，healthcheck 永不转绿）。` +
          `刻意要可选就登记进 OPTIONAL_BY_DESIGN_KEYS 并写明"为什么缺了也能起"。`,
      ).toMatch(new RegExp(`^\\$\\{${key}:\\?(.+)\\}$`));
    });
  }

  // ── 例外清单 ①：字面值键 ──
  it('NODE_ENV 由 compose 直接写死为 production（不是 .env 插值键）', () => {
    expect(appEnv.get('NODE_ENV')).toBe('production');
  });

  // ── 例外清单 ②：dev/CI 专用键必须缺席 ──
  for (const [key, reason] of Object.entries(PROD_FORBIDDEN_KEYS)) {
    it(`${key} 不出现在生产 compose 全文（${reason}）`, () => {
      expect(
        new RegExp(`\\b${key}\\b`).test(composeText),
        `${key} 出现在 docker-compose.prod.yml 里。${reason}——生产注入该键只可能意味着` +
          `有人想在生产建已知公开凭据的账号。`,
      ).toBe(false);
    });
  }

  // ── 例外清单 ③：刻意可选的键仍必须透传（只是形态放宽） ──
  for (const [key, reason] of Object.entries(OPTIONAL_BY_DESIGN_KEYS)) {
    it(`${key} 已透传（形态刻意可选：${reason}）`, () => {
      expect(
        [...appEnv.keys()],
        `${key} 声明为"刻意可选"，但那说的是插值形态可以是 \${${key}:-}，不是"可以不透传"。` +
          `不透传 = 容器里根本没这个变量，应用层的 fail-fast 分支永远走不到有 key 的那条。`,
      ).toContain(key);
    });
  }

  // ── 防腐：清单条目不许过期成"随手加一行就永久豁免"的历史遗迹 ──
  it('三张例外清单里的每个键，都仍被扫描器判为 production fail-fast 面（过期条目须删）', () => {
    const stale = [
      ...Object.keys(COMPOSE_LITERAL_KEYS),
      ...Object.keys(PROD_FORBIDDEN_KEYS),
      ...Object.keys(OPTIONAL_BY_DESIGN_KEYS),
    ].filter((k) => !failFast.has(k));
    expect(
      stale,
      `这些键已不在 src/ 的 production fail-fast 面上，例外条目失去依据：${stale.join(', ')}。` +
        `留着它们等于给未来同名的新键预先开好后门 —— 请从本文件顶部清单中删除。`,
    ).toEqual([]);
  });
});
