// M5-AUTH-RLS F002 — 登录/注册页 port 契约（spec D-10 §2.1-2.3）。
//
// 这三条约束（原型来源登记 / 只用模板既有原语 / 不新增第三方登录钮）都是**源码级事实**，
// 视觉基线守不住它们：截图不会因为「多 import 了一个 UI 库」而变红。故在此机械对账。
//
// 变异对照：
//   1. 页面加回 `import { FcGoogle }` + 第三方登录钮 → 「零第三方登录入口」红
//   2. 引入新 UI 库（如 @mui/*）或新开 Chakra 面 → 「导入源白名单」红
//   3. 删掉 template-inventory.md 的 B.1 登记段 → 「port 来源已登记」红
//   4. 页面改用自建输入框、不再用模板 InputField/DefaultAuthLayout → 「复用模板原语」红

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const LOGIN = readFileSync('src/app/login/page.tsx', 'utf8');
const SIGNUP = readFileSync('src/app/signup/page.tsx', 'utf8');
const INVENTORY = readFileSync('docs/dev/template-inventory.md', 'utf8');

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ['login', LOGIN],
  ['signup', SIGNUP],
];

/** 剥注释后再判定——fork 留痕注释里本来就要写「删了 Google 钮」，不剥就自己打自己。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .split('\n')
    .map((line) => {
      const idx = line.search(/(^|[^:])\/\//);
      return idx < 0 ? line : line.slice(0, idx);
    })
    .join('\n');
}

/** 取文件里所有 import 的来源串。 */
function importSources(src: string): string[] {
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

/** 允许的导入源前缀：react / next 生态 + 仓内模板原语与 lib。 */
const ALLOWED_IMPORT_PREFIXES = [
  'react',
  'next/',
  'next-auth/react',
  'components/',
  'lib/',
];

describe('M5-AUTH-RLS F002 — §2.2 只用模板 scaffold 既有原语', () => {
  it.each(PAGES)('%s 页复用模板布局与字段件（不自建输入框）', (_name, src) => {
    expect(src).toContain("from 'components/auth/variants/DefaultAuthLayout'");
    expect(src).toContain("from 'components/fields/InputField'");
    expect(src).toContain("from 'components/checkbox'");
  });

  it.each(PAGES)('%s 页导入源全部在白名单内（新 UI 库 / 新 Chakra 面即红）', (_name, raw) => {
    const src = stripComments(raw);
    const offenders = importSources(src).filter(
      (s) => !ALLOWED_IMPORT_PREFIXES.some((p) => s === p || s.startsWith(p)),
    );
    expect(offenders).toEqual([]);
    // Chakra 原语在本仓仅限既有零散用法，认证两页不得新开面
    expect(src).not.toContain('@chakra-ui/');
  });
});

describe('M5-AUTH-RLS F002 — §2.3 不得新增第三方登录按钮（本批无 OAuth）', () => {
  it.each(PAGES)('%s 页零第三方登录入口', (_name, raw) => {
    const src = stripComments(raw);
    expect(src).not.toContain('FcGoogle');
    expect(src).not.toMatch(/Google|GitHub|Apple|微信登录|OAuth/i);
    // 只有 credentials 一种登录方式
    for (const m of src.matchAll(/signIn\(\s*'([^']+)'/g)) {
      expect(m[1]).toBe('credentials');
    }
  });
});

describe('M5-AUTH-RLS F002 — §2.1 port 来源登记', () => {
  it('template-inventory.md 记了两页的模板实源路径与形态', () => {
    expect(INVENTORY).toContain('src/app/login/page.tsx');
    expect(INVENTORY).toContain('src/app/signup/page.tsx');
    expect(INVENTORY).toContain('src/app/auth/sign-in/default/page.tsx');
    expect(INVENTORY).toContain('src/app/auth/sign-up/default/page.tsx');
    expect(INVENTORY).toContain(
      'db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0',
    );
  });

  it.each(PAGES)('%s 页文件头留了 port 实源与 fork 改动点（port-guide §2.4）', (_name, src) => {
    const header = src.slice(0, src.indexOf('import '));
    expect(header).toContain('port 实源');
    expect(header).toContain('fork 留痕');
    expect(header).toContain('horizon-tailwind-react-nextjs-pro-main');
  });
});

describe('M5-AUTH-RLS F002 — 两页是未登录可达面（与 F003 豁免清单联动）', () => {
  it('页面本身不做会话检查（拦截归 middleware 单一职责）', () => {
    for (const [, src] of PAGES) {
      expect(src).not.toContain('auth()');
      expect(src).not.toContain('getServerSession');
    }
  });
});
