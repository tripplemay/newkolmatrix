// M4-INSIGHT F012 fixing round1 — architecture.md 新鲜度回归测试
//
// 触发源：M4 首轮验收 F012 PARTIAL（对抗复核 4/4 UPHELD）——§7.2.1 权威节计数漂移是
// 「同一坑第三次踩」（fix_round1 快照化 / M3-A round2 枚举笔误 / 本批 21→24 未翻），
// §9.2 工具表计数自 M3-A 起陈旧。文档纪律靠自觉已证不可靠，此处装进工具链（机制化守门）：
// schema / 迁移 / 工具注册表变更而文档计数未随翻 → 本测试红 → CI 红。
//
// 只钉「计数与实物一致」这类可机械判定的漂移；语义级翻牌仍归各批 F012 人工复核。

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getPersona, listPersonas } from '../../src/lib/agent/registry';

const DOC = readFileSync('docs/dev/architecture.md', 'utf8');
const SCHEMA = readFileSync('prisma/schema.prisma', 'utf8');

function docCount(pattern: RegExp, label: string): number {
  const m = DOC.match(pattern);
  expect(
    m,
    `architecture.md 未找到计数锚点：${label}（格式变更须同步本测试）`,
  ).toBeTruthy();
  return Number(m![1]);
}

describe('§7.2.1 权威节计数 = 实物（第三次复发后机制化）', () => {
  it('模型清单计数 = schema.prisma 实物 model 数', () => {
    const actual = (SCHEMA.match(/^model /gm) ?? []).length;
    expect(docCount(/\*\*模型清单（(\d+) 个）\*\*/, '模型清单（N 个）')).toBe(
      actual,
    );
  });

  it('枚举计数 = schema.prisma 实物 enum 数', () => {
    const actual = (SCHEMA.match(/^enum /gm) ?? []).length;
    expect(docCount(/\*\*枚举（(\d+) 个/, '枚举（N 个')).toBe(actual);
  });

  it('迁移条数 = prisma/migrations 目录实物', () => {
    const actual = readdirSync('prisma/migrations', {
      withFileTypes: true,
    }).filter((d) => d.isDirectory()).length;
    expect(
      docCount(/迁移（`prisma\/migrations\/`，(\d+) 条）/, '迁移（N 条）'),
    ).toBe(actual);
  });

  it('每个实物 enum 名都出现在文档枚举块', () => {
    for (const m of SCHEMA.matchAll(/^enum (\w+)/gm)) {
      expect(DOC, `枚举 ${m[1]} 未登记进 §7.2.1`).toContain(`enum ${m[1]}`);
    }
  });
});

describe('§9.2 工具表计数 = 注册表实物', () => {
  it('已实装工具计数 = NATIVE_TOOLS 注册数', () => {
    const actual = getNativeToolNames().length;
    expect(docCount(/\*\*已实装工具（(\d+) 个/, '已实装工具（N 个')).toBe(
      actual,
    );
  });

  it('每个注册工具名都出现在 architecture.md', () => {
    for (const name of getNativeToolNames()) {
      expect(DOC, `工具 ${name} 未登记进 architecture.md`).toContain(
        `\`${name}\``,
      );
    }
  });
});

describe('§8.6 名册 as-built 行 = registry 实物', () => {
  // M4.5 F010：从只钉 insight 一行扩到**全人格**——本批 orchestrator / compliance 也扩了工具，
  // 只钉一行等于只守一个人格的漂移。
  for (const persona of listPersonas()) {
    it(`${persona.id} 人格声明的每个工具名都出现在名册对应行`, () => {
      const row = DOC.split('\n').find((l) =>
        l.startsWith(`| \`${persona.id}\` | ${persona.name}`),
      );
      expect(row, `名册表 ${persona.id} 行缺失`).toBeTruthy();
      for (const name of persona.tools) {
        expect(row!, `${persona.id} 行缺工具 ${name}`).toContain(name);
      }
    });
  }
});

describe('§8.3.2 步数预算表 = registry maxSteps 实物（M4.5 F002/F010）', () => {
  it('文档档位值 = 常量实物（改档忘翻文档 → 红）', () => {
    expect(
      docCount(/\| 深链 \| `EXTENDED_MAX_STEPS` \| (\d+) \|/, '深链档位'),
    ).toBe(getPersona('insight').maxSteps);
    expect(
      docCount(/\| 常规 \| `DEFAULT_MAX_STEPS` \| (\d+) \|/, '常规档位'),
    ).toBe(getPersona('reach').maxSteps);
  });

  it('深链档人格名单 = 实物（新人格调档忘翻文档 → 红）', () => {
    const deep = listPersonas()
      .filter((p) => p.maxSteps > getPersona('reach').maxSteps)
      .map((p) => p.id);
    const row = DOC.split('\n').find((l) => l.startsWith('| 深链 |'));
    expect(row, '§8.3.2 深链档行缺失').toBeTruthy();
    for (const id of deep) {
      expect(row!, `深链档行缺人格 ${id}`).toContain(`\`${id}\``);
    }
    // 常规档人格不得出现在深链行（防「全都写上去」式的假通过）
    for (const p of listPersonas()) {
      if (deep.includes(p.id)) continue;
      expect(row!, `深链档行不应含常规档人格 ${p.id}`).not.toContain(
        `\`${p.id}\``,
      );
    }
  });
});

describe('§8.10 例程表 = ROUTINES 注册表实物（reverify issue-5 回归钉）', () => {
  it('每个已注册例程在例程表中该行标「已实装」（行级作用域，仿 §8.6 断言写法）', async () => {
    // 动态 import：scheduler 模块顶层 import node-cron 等运行时件，仅本用例需要
    const { ROUTINES } = await import('../../src/lib/jobs/scheduler');
    for (const routine of ROUTINES) {
      const row = DOC.split('\n').find((l) =>
        l.startsWith(`| \`${routine.name}\` |`),
      );
      expect(row, `§8.10 例程表缺 ${routine.name} 行`).toBeTruthy();
      expect(row!, `例程 ${routine.name} 已注册但表行未标「已实装」`).toContain(
        '已实装',
      );
    }
  });
});

describe('M4 批内陈旧标记清零（issue-4 回归钉）', () => {
  it('architecture.md 不再含「演进 M4 / 归 M4」残留', () => {
    expect(DOC).not.toMatch(/演进 M4|归 M4|演进目标归 M4/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M4.5-AGENT-LOOP fixing round1 — 覆盖面扩到 agent-architecture.md
//
// 触发源：M4.5 首轮验收 F010 PARTIAL 缺陷 ③。本门此前只读 architecture.md +
// schema.prisma，`agent-architecture.md` **零机械覆盖**；而人工「批末新鲜度复核」
// 用的 grep 又带左括号（`stepCountIs(`）且不搜 docs/ —— 两道防线的盲区恰好重叠，
// 于是 4 条已作废的 as-built 陈述与新说法在权威文档里并存了整整一个批次
//（architecture.md line 26 自订原则：「已实装一律 as-built…不保留双份说法」）。
//
// 这里钉的是**已作废 API 名 / 已改档位值**这类可机械判定的漂移，不是语义复核。
// ────────────────────────────────────────────────────────────────────────────
const AGENT_DOC = readFileSync('docs/dev/agent-architecture.md', 'utf8');

describe('agent-architecture.md 新鲜度（M4.5 F010 缺陷③ 回归钉）', () => {
  /** 两份权威文档一起扫——漂移不挑文件。 */
  const AUTHORITATIVE: ReadonlyArray<readonly [string, string]> = [
    ['docs/dev/architecture.md', DOC],
    ['docs/dev/agent-architecture.md', AGENT_DOC],
  ];

  it('不得残留已作废的流式 API 名 toUIMessageStreamResponse', () => {
    // 实物：route.ts 用 createUIMessageStream + createUIMessageStreamResponse（M4.5 F006）。
    const route = readFileSync('src/app/api/agent/route.ts', 'utf8');
    expect(
      route,
      '前提失效：route 已不再用 createUIMessageStreamResponse，本断言需重写',
    ).toContain('createUIMessageStreamResponse');
    expect(route).not.toContain('toUIMessageStreamResponse');

    for (const [name, doc] of AUTHORITATIVE) {
      const stale = doc
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /(?<!create)[Tt]oUIMessageStreamResponse/.test(l));
      expect(
        stale.map(([n, l]) => `${name}:${n}: ${l.trim()}`),
        `${name} 仍写着已作废的 toUIMessageStreamResponse`,
      ).toEqual([]);
    }
  });

  it('不得出现 stepCountIs 后跟数字字面量（带不带括号都算——原 grep 只搜带括号的，漏了文档写法）', () => {
    for (const [name, doc] of AUTHORITATIVE) {
      const stale = doc
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        // 关键：`[(\s]` —— 代码写 `stepCountIs(5)`，文档写 `stepCountIs 5`，两种都要抓
        .filter(([, l]) => /stepCountIs[(\s]\s*[0-9]/.test(l));
      expect(
        stale.map(([n, l]) => `${name}:${n}: ${l.trim()}`),
        `${name} 写死了步数上限（真相源是 registry 的 persona.maxSteps）`,
      ).toEqual([]);
    }
  });

  it('agent-architecture.md 的工具清单覆盖注册表实物（新工具漏登记 → 红）', () => {
    for (const name of getNativeToolNames()) {
      expect(
        AGENT_DOC,
        `agent-architecture.md 未提及已注册工具 ${name}`,
      ).toContain(name);
    }
  });

  it('system 装配序的 as-built 句 = 实物装配顺序（M4.6 D4 回归钉）', () => {
    // 触发源：M4.6-CTX 首轮验收 D4——加了项目上下文段，但 agent-architecture.md 里
    // 那句标着 as-built 的 `system = persona.systemPrompt + 知识段 + 工具指引` 没翻，
    // 而既有机械门只钉工具清单/步数/废弃 API 名，钉不到这种「句子级」漂移。
    //
    // 判据取自实物：buildLoopSystem 的拼接表达式里各段的出现次序。
    // M4.7 F002：buildLoopSystem 从 loop.ts 抽到 system-assembly.ts（断 tools/index 循环）
    const loopSrc = readFileSync('src/lib/agent/system-assembly.ts', 'utf8');
    const exprStart = loopSrc.indexOf('persona.systemPrompt +');
    // 【显式钉前提】原先用 indexOf('NO_TOOL_CLAUSE') 当切片终点，而它在第 42 行的
    // import 里就出现了（早于拼接表达式）→ 切出空串。取证器看不见目标时必须当场红，
    // 不能让后面的断言在空输入上「碰巧成立」。
    expect(
      exprStart,
      'buildLoopSystem 的拼接表达式没找到（结构变更须同步本测试）',
    ).toBeGreaterThan(0);
    const expr = loopSrc.slice(exprStart, exprStart + 400);
    expect(expr, '切片为空 = 取证器失效').not.toBe('');
    // 【必须按实际位置排序】起初漏了 .sort，于是数组永远按我声明的顺序产出，
    // 把实物里 projectSection 挪到 knowledgeSection 之后也照样绿 —— 死断言。
    // 【S-M46-7 收口】原先只钉 3 段实物却比对 4 段文档句——把「工具指引」挪到知识段
    // 之前是真实漂移，钉子却全绿（M4.6 复验实测 R-MUT-9）。钉子的覆盖面必须与它
    // 守护的那句话**逐项对齐**，N-1 段 = 留了一道静默门。
    const order = [
      'persona.systemPrompt',
      'projectSection',
      'knowledgeSection',
      'toolLines', // 工具指引段（拼接里以 toolLines 出现）
    ]
      .map((seg) => [seg, expr.indexOf(seg)] as const)
      .filter(([, i]) => i >= 0)
      .sort((a, b) => a[1] - b[1]);
    expect(order.length, '四段应全部出现在拼接表达式里').toBe(4);
    expect(
      order.map(([s]) => s),
      '实物装配序变了 —— 本断言与文档句都要随之更新',
    ).toEqual([
      'persona.systemPrompt',
      'projectSection',
      'knowledgeSection',
      'toolLines',
    ]);

    const row = AGENT_DOC.split('\n').find((l) => l.includes('system 装配序'));
    expect(
      row,
      'agent-architecture.md 缺「system 装配序」as-built 句',
    ).toBeTruthy();
    const docOrder = [
      'persona.systemPrompt',
      '当前项目上下文段',
      '知识段',
      '工具指引',
    ];
    let cursor = -1;
    for (const seg of docOrder) {
      const at = row!.indexOf(seg, cursor + 1);
      expect(at, `装配序句里缺「${seg}」或顺序不对`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('agent-architecture.md 的步数档位值 = registry 实物', () => {
    const deep = Math.max(...listPersonas().map((p) => p.maxSteps));
    const normal = getPersona('reach').maxSteps;
    const row = AGENT_DOC.split('\n').find((l) => l.includes('**步数预算**'));
    expect(row, 'agent-architecture.md 缺步数预算行').toBeTruthy();
    expect(row!, `深链档位应为 ${deep}`).toContain(`= ${deep}`);
    expect(row!, `常规档位应为 ${normal}`).toContain(`其余 ${normal}`);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M4.7-FRONTDESK F010 — 单一前台面的 as-built 钉
// ────────────────────────────────────────────────────────────────────────────
describe('M4.7 单一前台 as-built（新工具 / 前台职责 / 成本常量）', () => {
  it('子 Agent 调用形态已翻牌为 as-built（不得再写「未实装」）', () => {
    const row = DOC.split('\n').find((l) => l.includes('子 Agent 调用'));
    expect(row, 'architecture.md 缺两形态表的子 Agent 调用列').toBeTruthy();
    const stateRow = DOC.split('\n').find(
      (l) => l.startsWith('| 状态 |') && l.includes('Handoff'),
    );
    expect(stateRow, '缺状态行').toBeTruthy();
    expect(
      stateRow!,
      '子 Agent 调用已实装，状态行不得仍写「未实装」',
    ).not.toContain('未实装');
    expect(stateRow!).toContain('specialist-loop');
  });

  it('前台职责文案 = registry 实物（改 duty 忘翻文档 → 红）', () => {
    const front = getPersona('orchestrator');
    const row = DOC.split('\n').find((l) =>
      l.startsWith('| `orchestrator` |'),
    );
    expect(row, '§8.6 名册缺 orchestrator 行').toBeTruthy();
    expect(row!, '名册行的护栏文案与 registry 漂移').toContain(front.isolation);
  });

  it('三个成本常量值 = registry 实物（agent-architecture 写死数字 → 红）', async () => {
    const { MAX_CONSULTS_PER_TURN, SPECIALIST_MAX_STEPS } = await import(
      '../../src/lib/agent/registry'
    );
    expect(AGENT_DOC, '缺每轮咨询上限').toContain(
      `MAX_CONSULTS_PER_TURN=${MAX_CONSULTS_PER_TURN}`,
    );
    expect(AGENT_DOC, '缺子 loop 步数上限').toContain(
      `SPECIALIST_MAX_STEPS=${SPECIALIST_MAX_STEPS}`,
    );
    expect(AGENT_DOC, '缺前台步数档位').toContain(
      `前台 \`maxSteps=${getPersona('orchestrator').maxSteps}\``,
    );
  });
});

describe('M4.8 加固 as-built（F007 · 含 S-RV3-4 段级钉）', () => {
  const TELEMETRY_SRC = readFileSync('src/lib/agent/loop-telemetry.ts', 'utf8');
  const REGISTRY_SRC = readFileSync('src/lib/agent/registry.ts', 'utf8');

  it('budgetHitScope 枚举值 = 实物（两份文档的枚举行与源码 union 集合相等）', () => {
    const m = TELEMETRY_SRC.match(/export type BudgetHitScope =([^;]+);/);
    expect(
      m,
      'loop-telemetry.ts 缺 BudgetHitScope 导出（改名须同步本测试）',
    ).toBeTruthy();
    const actual = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(actual.length, '实物 union 取值数').toBeGreaterThanOrEqual(4);
    for (const doc of [
      { text: AGENT_DOC, label: 'agent-architecture.md' },
      { text: DOC, label: 'architecture.md' },
    ]) {
      const line = doc.text
        .split('\n')
        .find((l) => l.includes('budgetHitScope'));
      expect(line, `${doc.label} 缺 budgetHitScope 枚举行`).toBeTruthy();
      const quoted = [...line!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
      expect(
        new Set(quoted),
        `${doc.label} 枚举行与实物 union 不一致（文档：${quoted.join(',')} / 实物：${actual.join(',')}）`,
      ).toEqual(new Set(actual));
    }
  });

  it('超时告知文案函数与留痕 marker = 实物（改名/改 marker 忘翻文档 → 红）', async () => {
    // 绑实物：函数与 marker 必须真实存在——若源码改名，这里先红，逼文档同批翻牌
    expect(
      REGISTRY_SRC,
      'registry.ts 缺 loopTimeoutNotice 导出（改名须同步文档与本测试）',
    ).toContain('export function loopTimeoutNotice');
    const { LOOP_TIMEOUT_MARKER } = await import(
      '../../src/lib/agent/loop-timeout-log'
    );
    for (const doc of [
      { text: AGENT_DOC, label: 'agent-architecture.md' },
      { text: DOC, label: 'architecture.md' },
    ]) {
      expect(doc.text, `${doc.label} 缺超时文案函数名`).toContain(
        'loopTimeoutNotice',
      );
      expect(doc.text, `${doc.label} 缺超时留痕 marker`).toContain(
        LOOP_TIMEOUT_MARKER,
      );
    }
  });

  it('S-RV3-4a：两形态表表头单元格钉（段级——改坏表头不再静默）', () => {
    const pinned =
      '| 维度 | 工具级共享（主用） | 子 Agent 调用（**M4.7 F001/F002 已实装**） |';
    const hit = DOC.split('\n').some((l) => l.trim() === pinned);
    expect(
      hit,
      `architecture.md 两形态表表头与钉住的全串不符（S-RV3-4：表头单元格改坏此前不会红）。若表头合法演进，同步改本钉：${pinned}`,
    ).toBe(true);
  });

  it('S-RV3-4b：「M4.7 新增工具（N 件）」句钉（计数=句内清单自洽 + 工具在注册表）', () => {
    const line = AGENT_DOC.split('\n').find((l) =>
      l.includes('M4.7 新增工具'),
    );
    expect(line, 'agent-architecture.md 缺「M4.7 新增工具」句').toBeTruthy();
    const m = line!.match(/M4\.7 新增工具（(\d+) 件）/);
    expect(m, '句式漂移：缺「（N 件）」计数（S-RV3-4：此句改坏此前不会红）').toBeTruthy();
    const count = Number(m![1]);
    const tools = [...line!.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]);
    expect(tools.length, '句内工具清单数量与「（N 件）」不一致').toBe(count);
    const registered = getNativeToolNames();
    for (const t of tools) {
      expect(registered, `句内工具 ${t} 不在注册表实物中`).toContain(t);
    }
  });
});

describe('M5 认证 + RLS as-built（F013）', () => {
  it('认证选型行 = 实物（package.json 有 next-auth 且文档不再写「认证 | 无」）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(
      pkg.dependencies?.['next-auth'],
      'package.json 缺 next-auth 依赖（若移除认证框架须同步翻牌选型表）',
    ).toBeTruthy();
    const row = DOC.split('\n').find((l) => l.startsWith('| 认证 |'));
    expect(row, 'architecture.md 缺选型表认证行').toBeTruthy();
    expect(row!, '认证行仍是旧「无」口径').toContain('Auth.js v5');
    expect(row!, '认证行不得再声称「无（硬编码 dev tenant」').not.toContain(
      '认证 | 无（',
    );
  });

  it('RLS 状态句诚实：地基已就位 + 运行时未切换（两半都得在，只写一半 = 撒谎的两种方向）', () => {
    const line = DOC.split('\n').find((l) => l.includes('租户与认证'));
    expect(line, 'architecture.md 缺租户与认证 bullet').toBeTruthy();
    // 正向半句：地基事实绑实物——开关常量真实存在
    const appRoleSrc = readFileSync('src/lib/db/app-role.ts', 'utf8');
    expect(appRoleSrc, '实物缺 DB_APP_ROLE_RUNTIME 开关（改名须同步文档与本测试）').toContain(
      'DB_APP_ROLE_RUNTIME',
    );
    expect(line!, '文档缺开关名（地基半句）').toContain('DB_APP_ROLE_RUNTIME');
    expect(line!, '文档缺 kol_app（地基半句）').toContain('kol_app');
    // 否定半句：运行时未切换必须明写（M5.1 归属）——防「RLS 已启用」被读成「已生效」
    expect(line!, '文档缺「运行时未切换」半句（诚实红线）').toContain('运行时未切换');
    expect(line!, '文档缺 M5.1 归属').toContain('M5.1');
  });

  it('middleware 豁免面计数 = 实物（EXEMPT_RULES 单一真相源）', async () => {
    const { EXEMPT_RULES } = await import('../../src/lib/auth/access-policy');
    const line = DOC.split('\n').find((l) => l.includes('EXEMPT_RULES'));
    expect(line, 'architecture.md 缺豁免面句').toBeTruthy();
    const m = line!.match(/恰 (\d+) 条/);
    expect(m, '豁免面句缺「恰 N 条」计数').toBeTruthy();
    expect(Number(m![1]), '文档豁免计数与实物 EXEMPT_RULES 长度漂移').toBe(
      EXEMPT_RULES.length,
    );
  });

  it('NFR-S9 的「零翻修」必须带限定域（I-2：原句「既有 137 个测试文件零翻修」被 git 实物证伪）', () => {
    const line = DOC.split('\n').find((l) => l.includes('NFR-S9'));
    expect(line, 'architecture.md 缺 NFR-S9 多租户预留句').toBeTruthy();
    // 这条钉守的是**表述精度**，不是功能：本批实际改了 8 个既有 tests/**/*.ts（7 个 *.test.ts）
    // 与 5 张 Linux 视觉基线，「既有 N 个测试文件零翻修」这种绝对句拿 git 一数就翻。
    // 数法（本机可复现，CI 因浅克隆不跑 git 史，故这里只钉表述而不钉数字）：
    //   git diff --name-status 3901404..HEAD -- tests/ | grep '^M'
    expect(line!, '被 git 证伪的绝对句复活了').not.toMatch(/\d+\s*个测试文件零翻修/);
    expect(
      line!,
      '「零翻修」必须写明限定域（RLS 面），否则又是一句会被实物证伪的绝对话',
    ).toContain('RLS 面零翻修');
    expect(line!, '须写明既有测试的适配面来自 F004 会话注入缝，而非「一个都没改」').toContain(
      'F004',
    );
  });

  it('401 语义句随实装翻牌（不得残留「无认证故无 401」）', () => {
    expect(DOC, '旧「无认证故无 401」句仍在').not.toContain('无认证故**无 401**');
    const line = DOC.split('\n').find((l) => l.includes('401 = 认证失败'));
    expect(line, '缺 M5 的 401 语义句').toBeTruthy();
    expect(line!, '403 闸门语义半句必须保留').toContain('403 仍专属闸门语义');
  });
});
