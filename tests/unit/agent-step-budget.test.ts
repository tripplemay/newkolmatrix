// M4.5-AGENT-LOOP F002 — 按人格步数预算（U2）单一真相源回归测试
//
// 守两件事：
// 1. 预算档位与人格的对应关系（insight/orchestrator 深链 10 步，其余 5 步）
// 2. **不得出现第二处硬编码步数**——预算一旦在 route/loop/文档里各写一份，
//    调档时必然漏改一处，而漏改的表现是「模型在第 5 步被截停但遥测说预算是 10」，
//    极难从现象反推。故此处以 git grep 钉死：全仓 stepCountIs(...) 不得带数字字面量。

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MAX_STEPS,
  EXTENDED_MAX_STEPS,
  listPersonas,
} from 'lib/agent/registry';

/** git grep（无匹配时 git 退出码 1，此处归一为空数组）。 */
function gitGrep(pattern: string, pathspec: string[]): string[] {
  try {
    return execFileSync(
      'git',
      ['grep', '-nE', pattern, '--', ...pathspec],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

const DEEP_CHAIN_AGENTS = ['insight', 'orchestrator'];

describe('F002 步数预算档位（U2 人格差异化）', () => {
  it('档位常量：常规 5 / 深链 10', () => {
    expect(DEFAULT_MAX_STEPS).toBe(5);
    expect(EXTENDED_MAX_STEPS).toBe(10);
  });

  it('insight / orchestrator = 深链档，其余人格 = 常规档（既有 5 步行为零变化）', () => {
    for (const p of listPersonas()) {
      const expected = DEEP_CHAIN_AGENTS.includes(p.id)
        ? EXTENDED_MAX_STEPS
        : DEFAULT_MAX_STEPS;
      expect(p.maxSteps, `persona=${p.id} 步数预算`).toBe(expected);
    }
  });

  it('每个人格都显式声明了预算（新增人格不得漏配）', () => {
    for (const p of listPersonas()) {
      expect(typeof p.maxSteps, `persona=${p.id}`).toBe('number');
      expect(p.maxSteps).toBeGreaterThan(0);
    }
  });
});

describe('F002 单一真相源（grep 证：无第二处硬编码）', () => {
  it('全仓 stepCountIs(...) 不带数字字面量（预算只能来自 persona.maxSteps）', () => {
    const hits = gitGrep(String.raw`stepCountIs\(\s*[0-9]`, ['src', 'scripts']);
    expect(
      hits,
      `发现硬编码步数上限（应改读 persona.maxSteps）：\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('loop.ts 是唯一消费点，且读的是 persona.maxSteps', () => {
    // M4.7 F002：合法消费点从一处变两处——主 loop（前台，读 persona.maxSteps）
    // 与专家子 loop（读 SPECIALIST_MAX_STEPS 常量）。两者都不含数字字面量，
    // 上一条断言仍然钉死"无第二处硬编码"。
    const consumers = gitGrep(String.raw`stepCountIs\(`, ['src']);
    expect([...new Set(consumers.map((l) => l.split(':')[0]))].sort()).toEqual([
      'src/lib/agent/loop.ts',
      'src/lib/agent/specialist-loop.ts',
    ]);
    const src = readFileSync('src/lib/agent/loop.ts', 'utf8');
    expect(src).toContain('return persona.maxSteps;');
    expect(src).toContain('stopWhen: stepCountIs(maxSteps)');
    const sub = readFileSync('src/lib/agent/specialist-loop.ts', 'utf8');
    expect(sub, '子 loop 的上限也必须来自常量，不得写数字').toContain(
      'stopWhen: stepCountIs(SPECIALIST_MAX_STEPS)',
    );
  });

  it('route.ts maxDuration = 120（P3：深链预算需要的墙钟余量）', () => {
    const src = readFileSync('src/app/api/agent/route.ts', 'utf8');
    expect(src).toContain('export const maxDuration = 120;');
  });
});
