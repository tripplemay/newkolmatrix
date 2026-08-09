// M5.1b-TENANT-INJECTION F003 — 引导白名单的**越权面**普查钉。
//
// 【它守什么，和 F008 那道钉差在哪（两者不得互相派生）】
//   F008（db-layer-importer-census）：扫 **import specifier**，守「文件头注释里的 importer
//     清单与实物同步」——**文档漂移面**。
//   本钉：扫 **privilegedDb 标识符的真实使用**，守「谁在动这把绕过全部 RLS 的钥匙」，
//     且每条必须带**书面理由**——**越权面**。
// 判据不同（import 路径 vs 标识符使用）、维护点不同（期望清单 vs 理由清单）。
// 刻意不从对方派生：一处失效两处同时瞎，是 M4.7 规律 2 点名的反面教材。
// 具体差异可验：某文件 `import { privilegedDb } from ...` 却从不使用它 —— F008 绿（import 在册），
// 本钉红（登记了却无使用 = 陈旧登记）；反之动态取用而不 import 则本钉红、F008 绿。
//
// 【为什么这道钉最要紧】privilegedDb 恒连 DATABASE_URL（dev/prod = kol，owner），
// **绕过全部 RLS policy**。它不是「方便入口」，是一道后门。裁决 Q1-A 之所以选双 client，
// 靠的就是「例外可数、可钉、可复查」——可数由本钉保证，可复查由每条的 reason 保证。
//
// 【扫描口径】readFileSync 递归遍历 src/，**不用 git grep**（只搜已跟踪文件，新文件未
// commit 时恒空绿）。先剥行注释再剥块注释——顺序要紧，行注释里的 `/*`（如路由通配
// `/api/auth/*`）会开启幻影块注释吞掉后续代码，F003 实测踩中过（详见 F008 那道钉的同名函数）。
//
// 【盲区登记（实测，不是估计）】建钉时用四种「作者未采用的写法」打过本钉：
//   ✅ 抓到：`import * as ns` 后 `ns.privilegedDb` · 重命名 import（`as backdoor`）·
//            动态 `import()` 后取属性 · 顶部仍有 import 的动态键取用
//   ❌ **漏**：标识符从不作为完整 token 出现的动态键取用，例如
//              `const KEY = 'privileged' + 'Db'; (await import('./db/privileged'))[KEY]`
//            —— 本钉按词边界扫标识符，拼接出来的名字看不见。
//
// **该形态的一部分被 F008 那道钉抓住了**（它扫的是 import specifier `./db/privileged`，与名字无关）。
//
// > **更正（M5.1b fix-1）：上一版这里写「判据不同 ⇒ 盲区不重叠，实测互补」——该结论过强，已被证伪。**
// > 首轮验收的对抗复核实测：**拼接路径 + 拼接键**同时逃出两道钉——
// >   `const P = 'lib/db/' + 'privileged'; (await import(P))['privileged' + 'Db']`
// > 本钉看不见（标识符从未作为完整 token 出现），F008 那道钉也看不见（import specifier 是变量
// > 而非字面量）。两道钉的盲区**在动态拼接这一维上是重叠的**。
// > 判据不同只保证「不会因同一处修改而同时失效」，不保证「盲区不相交」——这两件事被混为一谈了。
// >（docs/test-reports/M5.1b-verify-F003-F004.md · M5.1b-adversarial-F003.md）
// > 该缺口目前无产品代码命中（本仓 db 层无动态拼接写法），登记在此不做修复：要堵它得上 AST /
// > 运行时插桩，成本与收益不匹配，且真正的兜底是 F006 那条「开关开 + 连 kol_app」的 e2e——
// > 走后门取到特权连接的代码，在那条 e2e 里读得到别租户的行，会被跨租户零行断言逮住。
//
// 若将来有人把 F008 那道钉删掉或改成从本钉派生，import specifier 那一维的缺口也会打开。
//
// 【tests/ 侧是否纳入射程 —— 显式决定：**不纳入**（M5.1b spec §4 硬约束第 2 条要求表态）】
// 两道钉守的是**产品越权面**：产品代码里谁在动这把绕过 RLS 的钥匙。测试夹具用 privilegedDb
// 建/删数据是本项目的既定纪律（F002 / F005 / F006 的夹具都这么写，理由各自写在文件头）——
// 夹具是脚手架，不是越权面；它本来就该绕过 RLS，否则连测试数据都建不起来。
// 若纳入，等于要求为每个测试文件登记一条 reason，而那些 reason 会全是同一句「夹具需要绕过
// RLS」——一份所有条目理由相同的清单没有复查价值，只剩维护噪声（本钉的价值恰恰在 reason 各不相同）。
//
// **代价如实登记：** tests/ 侧若有人把 privilegedDb 用于**验证产品行为**（而不是建夹具），
// 这两道钉看不见。那种误用的典型表现是「用特权连接去验 RLS 生效没生效」——它会恒绿。
// 防线不在这道钉，而在验收判据纪律：F006 acceptance ②(f) 明确要求跨租户零行的证据必须来自
// **kol_app 连接**，特权连接上的零行不作数。
// 该决定同样写在 tests/unit/db-layer-importer-census.test.ts 的 SRC_ROOT 旁（两钉射程一致）。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = 'src';
const PRIVILEGED_IDENTIFIER = 'privilegedDb';

/**
 * 引导白名单 —— **写死在这里，改代码才能改**。
 *
 * 做成「改代码才能豁免」是刻意的：清单一旦可配置、可从环境变量读、或可从扫描结果反推，
 * 它就不再是闸门而是回声（沿用 tests/unit/project-scope-census.test.ts 的豁免清单范式）。
 * 新增一条前先回答 reason 里那个问题；答不上来就说明那处不该用特权连接。
 */
const BOOTSTRAP_WHITELIST: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: 'src/lib/auth/index.ts',
    reason:
      '登录：输入只有 email，租户是这次查询的**产物**，而 RLS 要求先有租户才能查'
      + '（审计 B2-1 实测 kol_app 下 user.findUnique 恒 null ⇒ 没人能登录）。'
      + '失败登录的归因查询与两处 writeAuthAudit 同理：发生在会话之前，且留痕写的是'
      + '审计占位租户 / 被撞库租户的行，在 kol_app 下被 USING + WITH CHECK 双向拒。',
  },
  {
    file: 'src/lib/auth/register.ts',
    reason:
      '注册：要在事务里建 Tenant，而「要建的那个租户」此刻还不存在，无从注入租户变量'
      + '（审计 B2-2 实测 kol_app 下 tenant.create 被 WITH CHECK 拒）。',
  },
  {
    file: 'src/lib/agent/context.ts',
    reason:
      'tenantIdBySlug 是 systemContext 的第一步，无会话面（scheduler / scripts / seed / webhook）'
      + '全靠它把 slug 解析成租户 id——它本身就发生在「租户已知」之前'
      + '（审计 B2-3 实测 kol_app 下 tenant.findUnique(slug) 恒 null）。',
  },
  {
    file: 'src/app/api/auth/register/route.ts',
    reason:
      '注册限速留痕：限速判定发生在**解析入参之前**（不让攻击者用请求体消耗服务端资源），'
      + '此刻既无会话也无租户，留痕落审计占位租户。',
  },
  {
    file: 'src/app/api/auth/[...nextauth]/route.ts',
    reason: '登录限速留痕：同注册限速——判定在会话建立之前，留痕落审计占位租户。',
  },
];

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 先行后块——顺序见文件头。 */
function stripComments(source: string): string {
  const withoutLineComments = source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 剥字符串字面量 —— 否则「消息文本里提到这个名字」会被当成使用。
 *
 * 这不是假想形态：`src/lib/db/tenant-scope.ts` 的 MissingTenantScopeError 消息里写着
 * 「引导查询…改用 privilegedDb，白名单见 spec D-5 / F003」，本钉初版据此把它误判为
 * 未登记的越权点（F003 建钉时实测撞到）。
 *
 * 模板字面量只剥**字面片段**，保留 `${...}` 内的表达式——那里面是真代码，
 * `${privilegedDb.x}` 这类使用必须仍被看见。
 */
function stripStringLiterals(code: string): string {
  return code
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '``') // 无插值的模板串整体剥
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*/g, '`') // 有插值时只剥 ${ 之前的字面片段
    .replace(/\}(?:[^`\\$]|\\.|\$(?!\{))*`/g, '}`'); // 以及 } 之后到结尾的片段
}

/** 该文件是否**实际使用**了 privilegedDb 这个标识符（剥注释 + 剥字符串后按词边界匹配）。 */
function usesPrivileged(source: string): boolean {
  const code = stripStringLiterals(stripComments(source));
  return new RegExp(`\\b${PRIVILEGED_IDENTIFIER}\\b`).test(code);
}

function toPosix(p: string): string {
  return p.split(/[\\/]/).join(posix.sep);
}

describe('引导白名单越权面普查钉（F003）', () => {
  const files = collectSources(SRC_ROOT);
  const actual = files.filter((f) => usesPrivileged(readFileSync(f, 'utf8'))).map(toPosix).sort();
  const whitelisted = BOOTSTRAP_WHITELIST.map((e) => e.file).sort();

  it('扫描器确实看得见目标（防空转恒绿）', () => {
    // 活性证明：判据必须先证明它能抓到一个已知命中项（audit-methodology.md §8）。
    expect(files.length).toBeGreaterThan(50);
    expect(usesPrivileged(`import { privilegedDb } from 'lib/db/privileged';\nprivilegedDb.user.findUnique({});`)).toBe(true);
    // 注释里提到不算
    expect(usesPrivileged('// privilegedDb 恒 DATABASE_URL')).toBe(false);
    // 行注释里的 `/*` 不得吞掉后续真实使用（F003 实测踩过的形态）
    expect(
      usesPrivileged(['// 路由装配：/api/auth/*', 'const x = privilegedDb;'].join('\n')),
    ).toBe(true);
    // 子串不算（避免 myPrivilegedDbHelper 之类误判）
    expect(usesPrivileged('const myPrivilegedDbHelper = 1;')).toBe(false);
    // **字符串字面量里提到不算** —— 非假想形态：tenant-scope.ts 的错误消息里就写着这个名字，
    // 本钉初版据此把它误判为未登记越权点（F003 建钉时实测撞到）。
    expect(usesPrivileged(`throw new Error('引导查询改用 privilegedDb，白名单见 spec D-5');`)).toBe(
      false,
    );
    expect(usesPrivileged('const msg = "见 privilegedDb 白名单";')).toBe(false);
    // 但模板串的 `${}` 里是真代码，必须仍看得见
    expect(usesPrivileged('const n = `count=${await privilegedDb.user.count()}`;')).toBe(true);
  });

  it('src/ 下使用 privilegedDb 的文件必须全部在白名单内', () => {
    const unauthorized = actual.filter((f) => !whitelisted.includes(f) && f !== 'src/lib/db/privileged.ts');
    expect(
      unauthorized,
      `发现**未登记**的特权连接使用点：${unauthorized.join(', ')}\n` +
        'privilegedDb 绕过全部 RLS policy——每多一处未登记使用就是多一道后门。\n' +
        '要么改用 `prisma`（走 ALS 注入面），要么把它加进本文件的 BOOTSTRAP_WHITELIST\n' +
        '并写明「为什么这里必须在租户已知之前碰库」（spec D-5）。',
    ).toEqual([]);
  });

  it('白名单里的每一条都必须仍在实际使用（陈旧登记 = 白名单悄悄变长）', () => {
    const stale = whitelisted.filter((f) => !actual.includes(f));
    expect(
      stale,
      `白名单里这些文件已不再使用 privilegedDb：${stale.join(', ')}\n` +
        '陈旧登记会让白名单只增不减，最终变成一张没人敢删的清单——请一并移除。',
    ).toEqual([]);
  });

  it('白名单每一条都必须带**非空且具体**的理由', () => {
    for (const entry of BOOTSTRAP_WHITELIST) {
      expect(entry.reason.trim().length, `${entry.file} 的 reason 不能为空`).toBeGreaterThan(30);
      // 理由必须解释「为什么在租户已知之前」，而不是一句「需要特权」
      expect(
        /租户|会话|tenant|session/.test(entry.reason),
        `${entry.file} 的 reason 必须说明它与「租户/会话尚不存在」的关系，而不是泛泛的「需要特权」`,
      ).toBe(true);
    }
  });

  it('白名单**恒不可**从别处推导（不读 env、不读配置、不从扫描结果反推）', () => {
    // 【M5.1b fix-1：这条断言原先是恒绿的假保证，已重写】
    // 首轮验收实测：原判据只看「BOOTSTRAP_WHITELIST 后 200 字内没有 process.env」+
    // 「声明以 `= [` 开头」。把清单换成 `const BOOTSTRAP_WHITELIST = [...deriveFromScan()]`
    //（正是本条明令禁止的第三种形态）后，本文件 5 条全绿——闸门形同虚设。
    // 对抗复核进一步证明这不是纸面问题：它另建一个「取用 privilegedDb 但不 import 该模块」
    // 的后门探针，在派生清单下**全仓 1869 条测试无一察觉**，在字面量清单下会被本钉点名红。
    // 即那条变异拿掉的是真实且不可替代的防护。
    //（docs/test-reports/M5.1b-verify-F003-F004.md · M5.1b-adversarial-F003.md）
    //
    // 【新判据：正向白名单，不是负向黑名单】取出声明整段 → 抹掉字符串字面量 →
    // 断言骨架里出现的标识符**只能**是这 6 个。任何函数调用、展开、变量引用都会引入
    // 新标识符而当场翻红；黑名单式的「不含 process.env」则永远漏掉没想到的第 N 种写法
    //（audit-methodology.md §7：正向精确匹配 > 黑名单否定）。
    const selfSource = readFileSync('tests/unit/bootstrap-whitelist-census.test.ts', 'utf8');
    const code = stripComments(selfSource);

    const start = code.indexOf('const BOOTSTRAP_WHITELIST');
    expect(start, '找不到白名单声明（格式变更须同步本断言）').toBeGreaterThanOrEqual(0);
    const end = code.indexOf('\n];', start);
    expect(end, '找不到白名单声明的结尾 `\\n];`').toBeGreaterThan(start);
    const declaration = code.slice(start, end + 3);

    // 先抹字符串字面量：reason 里含中文、含 `...`（`[...nextauth]` 路由名），
    // 不先抹掉会把它们误当成展开运算符与代码标识符。
    const skeleton = declaration.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    // ① 骨架里不得有展开 / 模板串（两者都是把别处内容灌进来的通道）
    expect(skeleton, '白名单声明里出现了展开运算符 —— 清单被从别处灌入').not.toMatch(/\.\.\./);
    expect(skeleton, '白名单声明里出现了模板字符串').not.toMatch(/`/);

    // ② 骨架里允许出现的标识符只有这 6 个；多一个就说明清单不再是纯字面量
    const ALLOWED = new Set([
      'const',
      'BOOTSTRAP_WHITELIST',
      'ReadonlyArray',
      'file',
      'string',
      'reason',
    ]);
    const foreign = [...new Set(skeleton.match(/[A-Za-z_$][\w$]*/g) ?? [])].filter(
      (id) => !ALLOWED.has(id),
    );
    expect(
      foreign,
      `白名单声明里出现了不该有的标识符 ${foreign.join(' / ')} —— 说明它不再是写死的字面量清单，` +
        '而是从别处推导出来的（env / 配置 / 扫描结果）。「改代码才能豁免」是刻意的设计。',
    ).toEqual([]);

    // ③ 扫描器不空转：骨架必须真取到了内容（否则上面两条在空串上恒绿）
    expect(skeleton.length, '白名单声明取到的内容异常短').toBeGreaterThan(200);
  });
});
