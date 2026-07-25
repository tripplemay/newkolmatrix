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
import { getPersona } from '../../src/lib/agent/registry';

const DOC = readFileSync('docs/dev/architecture.md', 'utf8');
const SCHEMA = readFileSync('prisma/schema.prisma', 'utf8');

function docCount(pattern: RegExp, label: string): number {
  const m = DOC.match(pattern);
  expect(m, `architecture.md 未找到计数锚点：${label}（格式变更须同步本测试）`).toBeTruthy();
  return Number(m![1]);
}

describe('§7.2.1 权威节计数 = 实物（第三次复发后机制化）', () => {
  it('模型清单计数 = schema.prisma 实物 model 数', () => {
    const actual = (SCHEMA.match(/^model /gm) ?? []).length;
    expect(docCount(/\*\*模型清单（(\d+) 个）\*\*/, '模型清单（N 个）')).toBe(actual);
  });

  it('枚举计数 = schema.prisma 实物 enum 数', () => {
    const actual = (SCHEMA.match(/^enum /gm) ?? []).length;
    expect(docCount(/\*\*枚举（(\d+) 个/, '枚举（N 个')).toBe(actual);
  });

  it('迁移条数 = prisma/migrations 目录实物', () => {
    const actual = readdirSync('prisma/migrations', { withFileTypes: true }).filter(
      (d) => d.isDirectory(),
    ).length;
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
    expect(docCount(/\*\*已实装工具（(\d+) 个/, '已实装工具（N 个')).toBe(actual);
  });

  it('每个注册工具名都出现在 architecture.md', () => {
    for (const name of getNativeToolNames()) {
      expect(DOC, `工具 ${name} 未登记进 architecture.md`).toContain(`\`${name}\``);
    }
  });
});

describe('§8.6 名册 as-built 行 = registry 实物', () => {
  it('insight 人格声明的每个工具名都出现在名册 insight 行', () => {
    const row = DOC.split('\n').find((l) => l.startsWith('| `insight` | 洞察 Agent'));
    expect(row, '名册表 insight 行缺失').toBeTruthy();
    for (const name of getPersona('insight').tools) {
      expect(row!, `insight 行缺工具 ${name}`).toContain(name);
    }
  });
});

describe('M4 批内陈旧标记清零（issue-4 回归钉）', () => {
  it('architecture.md 不再含「演进 M4 / 归 M4」残留', () => {
    expect(DOC).not.toMatch(/演进 M4|归 M4|演进目标归 M4/);
  });
});
