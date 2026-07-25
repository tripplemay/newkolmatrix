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
