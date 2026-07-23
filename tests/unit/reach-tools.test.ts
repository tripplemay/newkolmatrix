// M3-A-REACH-CRM F006 — reach 工具扩容契约面单测（无 DB；沿 match-tools.test.ts 先例）。
//
// 盯「注册对、挂人格对（同源断言）、契约对、parser 双 shape 对」；execute 的落库/网关
// 路径见 tests/integration/reach-tools.test.ts（mock 网关）；真网关起草属 L2 留验收授权。

import { describe, expect, it } from 'vitest';
import {
  draftEmailTool,
  refineEmailTool,
  parseEmailDraftOutput,
} from 'lib/agent/tools/email-drafting';
import { commitQuoteTool } from 'lib/agent/tools/commit-quote';
import { getNativeToolNames } from 'lib/agent/tools';
import { getTool } from 'lib/agent/tools/registry';
import { getPersona } from 'lib/agent/registry';

const NEW_TOOLS = ['draft_email', 'refine_email', 'commit_quote'] as const;

describe('三工具注册 + reach 人格同源断言（acceptance 1）', () => {
  it('三工具均在唯一注册表中', () => {
    getNativeToolNames();
    for (const name of NEW_TOOLS) {
      expect(getTool(name), `${name} 应已注册`).toBeDefined();
    }
  });

  it('reach 人格 tools 数组挂载三工具，且全部条目与注册表同源（无幽灵工具名）', () => {
    const reach = getPersona('reach');
    expect(reach).toBeDefined();
    for (const name of NEW_TOOLS) {
      expect(reach!.tools).toContain(name);
    }
    // 同源：人格声明的每个工具名必须真实存在于注册表（防字符串漂移）
    const native = new Set(getNativeToolNames());
    for (const name of reach!.tools) {
      expect(native.has(name), `reach 人格声明的 ${name} 必须已注册`).toBe(
        true,
      );
    }
  });
});

describe('工具契约（D8）', () => {
  it('draft_email / refine_email：internal / native / 无 buildHarm（只生成不发送）', () => {
    for (const tool of [draftEmailTool, refineEmailTool]) {
      expect(tool.class).toBe('internal');
      expect(tool.source).toBe('native');
      expect(tool.buildHarm).toBeUndefined();
    }
  });

  it('commit_quote：outbound / native / 有 buildHarm（报价承诺过闸门）', () => {
    expect(commitQuoteTool.class).toBe('outbound');
    expect(commitQuoteTool.source).toBe('native');
    expect(commitQuoteTool.buildHarm).toBeDefined();
  });

  it('commit_quote 输入契约：金额正数、币种 3 位、交付物非空数组', () => {
    const base = {
      projectId: 'p1',
      kolId: 'k1',
      amount: 1500,
      currency: 'USD',
      deliverables: ['1 条长视频'],
    };
    expect(commitQuoteTool.inputSchema.safeParse(base).success).toBe(true);
    expect(
      commitQuoteTool.inputSchema.safeParse({ ...base, amount: 0 }).success,
    ).toBe(false);
    expect(
      commitQuoteTool.inputSchema.safeParse({ ...base, amount: -5 }).success,
    ).toBe(false);
    expect(
      commitQuoteTool.inputSchema.safeParse({ ...base, currency: 'US' })
        .success,
    ).toBe(false);
    expect(
      commitQuoteTool.inputSchema.safeParse({ ...base, deliverables: [] })
        .success,
    ).toBe(false);
  });

  it('draft_email 输入契约：projectId/kolId 必填，brief 可省略', () => {
    expect(
      draftEmailTool.inputSchema.safeParse({ projectId: 'p', kolId: 'k' })
        .success,
    ).toBe(true);
    expect(
      draftEmailTool.inputSchema.safeParse({ projectId: 'p' }).success,
    ).toBe(false);
  });

  it('refine_email 输入契约：projectId/body/instruction 必填非空（F008 起草稿落库需线程归属）', () => {
    const base = {
      projectId: 'p',
      kolId: 'k',
      subject: 's',
      body: 'b',
      instruction: '更简短',
    };
    expect(refineEmailTool.inputSchema.safeParse(base).success).toBe(true);
    expect(
      refineEmailTool.inputSchema.safeParse({ ...base, instruction: '' })
        .success,
    ).toBe(false);
    expect(
      refineEmailTool.inputSchema.safeParse({ ...base, projectId: undefined })
        .success,
    ).toBe(false);
  });
});

describe('parser 双 shape 兼容（ai-action-contract §1.3）', () => {
  it('栅栏 JSON / 裸 JSON 对象均可解析', () => {
    const fenced = '```json\n{"subject":"S","body":"B"}\n```';
    expect(parseEmailDraftOutput(fenced)).toEqual({ subject: 'S', body: 'B' });
    expect(parseEmailDraftOutput('{"subject":"S2","body":"B2"}')).toEqual({
      subject: 'S2',
      body: 'B2',
    });
  });

  it('非 JSON 输出兜底：整体视为 body（不炸不丢内容）', () => {
    const out = parseEmailDraftOutput('Hello creator, plain text mail.');
    expect(out.subject).toBe('');
    expect(out.body).toContain('plain text mail');
  });

  it('形状漂移（缺 subject）→ subject 空串，body 保底', () => {
    const out = parseEmailDraftOutput('{"body":"only body"}');
    expect(out.subject).toBe('');
    expect(out.body).toBe('only body');
  });
});
