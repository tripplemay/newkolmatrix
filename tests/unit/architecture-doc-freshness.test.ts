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
    const order = ['persona.systemPrompt', 'projectSection', 'knowledgeSection']
      .map((seg) => [seg, expr.indexOf(seg)] as const)
      .filter(([, i]) => i >= 0)
      .sort((a, b) => a[1] - b[1]);
    expect(order.length, '三段应全部出现在拼接表达式里').toBe(3);
    expect(
      order.map(([s]) => s),
      '实物装配序变了 —— 本断言与文档句都要随之更新',
    ).toEqual(['persona.systemPrompt', 'projectSection', 'knowledgeSection']);

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
