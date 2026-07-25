// M4.5-AGENT-LOOP · Evaluator(G4) 独立探针 — F008 画布渐进渲染（裁决 C）
//
// 独立性说明：本文件由 Evaluator 在隔离上下文中自写，不复用 Generator 的
// tests/unit/canvas-progressive.test.ts 的任何断言思路。
//
// Generator 的自测只做了两件事：① 对 pickToolRenderMode 传状态字符串断分支
// ② 对 PlanCardDraft.tsx **源码字符串** grep「不含 needsGate」。
// 两者都没有走过真实的 UI message stream，也没有渲染过组件——
// 「模型逐 token 写入参 → partial input → 卡片边写边出」这条链在 Generator 的证据里是空的。
//
// 本探针改用 AI SDK 自带的 `readUIMessageStream` 喂真实 `tool-input-start / tool-input-delta /
// tool-input-available / tool-output-available` 片序列（wire 层协议片，与真网关下发的是同一组），
// 拿到每一帧的 UIMessage 快照后：
//   ① 用 pickToolRenderMode 判分支 ② 用 react-dom/server 真渲染 ③ 对渲染出的 HTML 断言。
// 这样「渐进」「不闪烁」「渐进态不出闸门标注」都落在**渲染产物**上，而不是源码文本上。
//
// 仍测不到的（如实登记）：真网关是否真的下发 tool-input-delta（provider 侧行为）→ L2。
// 本探针证明的是：**只要下发了 delta，前端这条链会正确渐进**。

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import {
  hasCanvasDraftRenderer,
  pickToolRenderMode,
  renderToolInputDraft,
  renderToolResult,
} from 'components/copilot/canvas/canvas-registry';
import PlanCardDraft from 'components/copilot/canvas/PlanCardDraft';

const TOOL_CALL_ID = 'g4-tc-1';

/** 模型逐 token 写出来的 propose_plan 入参 —— 刻意让 needsGate:true 出现在流里。 */
const PLAN_INPUT_JSON = JSON.stringify({
  title: 'G4 探针：本周分享与跟进',
  items: [
    {
      title: '先算一遍组合 ROI',
      toolName: 'compute_roi_portfolio',
      needsGate: false,
    },
    {
      title: '生成季度分享链接',
      toolName: 'create_share_link',
      needsGate: true,
    },
    { title: '把周报发出去', toolName: 'draft_report', needsGate: true },
  ],
});

/** 把 JSON 切成 N 段，模拟 token 级增量。 */
function sliceIntoDeltas(json: string, pieces: number): string[] {
  const size = Math.ceil(json.length / pieces);
  const out: string[] = [];
  for (let i = 0; i < json.length; i += size) out.push(json.slice(i, i + size));
  return out;
}

function buildChunks(): UIMessageChunk[] {
  const deltas = sliceIntoDeltas(PLAN_INPUT_JSON, 18);
  return [
    { type: 'start', messageId: 'g4-m1' },
    { type: 'start-step' },
    {
      type: 'tool-input-start',
      toolCallId: TOOL_CALL_ID,
      toolName: 'propose_plan',
    },
    ...deltas.map(
      (d): UIMessageChunk => ({
        type: 'tool-input-delta',
        toolCallId: TOOL_CALL_ID,
        inputTextDelta: d,
      }),
    ),
    {
      type: 'tool-input-available',
      toolCallId: TOOL_CALL_ID,
      toolName: 'propose_plan',
      input: JSON.parse(PLAN_INPUT_JSON),
    },
    {
      type: 'tool-output-available',
      toolCallId: TOOL_CALL_ID,
      // 服务端复核后的最终产物（propose_plan 的真实输出形状）
      output: {
        type: 'action_plan',
        planId: 'g4-plan-1',
        title: 'G4 探针：本周分享与跟进',
        projectId: null,
        items: [
          {
            title: '先算一遍组合 ROI',
            toolName: 'compute_roi_portfolio',
            needsGate: false,
            gateUnderreported: false,
            toolKnown: true,
            note: null,
          },
          {
            title: '生成季度分享链接',
            toolName: 'create_share_link',
            needsGate: true,
            gateUnderreported: false,
            toolKnown: true,
            note: null,
          },
          {
            title: '把周报发出去',
            toolName: 'draft_report',
            needsGate: true,
            gateUnderreported: false,
            toolKnown: true,
            note: null,
          },
        ],
        needsGateCount: 2,
        disclosure: '这是一份计划，还没有执行任何一步。',
        createdAt: new Date(0).toISOString(),
      },
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ] as UIMessageChunk[];
}

interface Frame {
  state: string | undefined;
  mode: string;
  html: string;
}

/** 走真 SDK 流 → 每帧算分支 + 真渲染。 */
async function collectFrames(): Promise<Frame[]> {
  const chunks = buildChunks();
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });

  const frames: Frame[] = [];
  for await (const message of readUIMessageStream({ stream })) {
    const part = (
      message.parts as Array<{
        type: string;
        state?: string;
        input?: unknown;
        output?: unknown;
      }>
    ).find((p) => p.type === 'tool-propose_plan');
    if (!part) continue;
    const mode = pickToolRenderMode('propose_plan', part.state, part.output);
    const el =
      mode === 'draft'
        ? renderToolInputDraft('propose_plan', part.input)
        : mode === 'canvas'
        ? renderToolResult('propose_plan', part.output)
        : null;
    frames.push({
      state: part.state,
      mode,
      html: el ? renderToStaticMarkup(el) : '',
    });
  }
  return frames;
}

/** 从渐进卡 HTML 里数出已渲染的步骤条数（<li> 个数）。 */
function countItems(html: string): number {
  return (html.match(/<li /g) ?? []).length;
}

describe('F008-G4 · 真 UI message stream 下的渐进链路', () => {
  it('SDK 把 tool-input-delta 装配成 state=input-streaming 的 partial input（前提事实核实）', async () => {
    const frames = await collectFrames();
    const streamingFrames = frames.filter((f) => f.state === 'input-streaming');
    expect(streamingFrames.length).toBeGreaterThan(3);
    // 装配到 input-available / output-available 两个终态也都出现过
    expect(frames.some((f) => f.state === 'input-available')).toBe(true);
    expect(frames.some((f) => f.state === 'output-available')).toBe(true);
  });

  it('渐进态真的「标题先出 → 步骤逐条出」（不是一次性全出）', async () => {
    const frames = await collectFrames();
    const drafts = frames.filter((f) => f.mode === 'draft' && f.html !== '');

    // ① 至少存在一帧「标题已出、步骤还是 0 条」——证明标题先于步骤
    const titleOnly = drafts.filter(
      (f) => f.html.includes('本周分享与跟进') && countItems(f.html) === 0,
    );
    expect(titleOnly.length).toBeGreaterThan(0);

    // ② 步骤条数出现过 1 条与 2 条的中间态——证明是逐条出、不是一次性 3 条
    const counts = drafts.map((f) => countItems(f.html));
    expect(counts).toContain(1);
    expect(counts).toContain(2);
    expect(Math.max(...counts)).toBe(3);
  });

  it('不闪烁：渐进过程中步骤条数单调不减、标题一旦出现不再消失', async () => {
    const frames = await collectFrames();
    const drafts = frames.filter((f) => f.mode === 'draft');
    let maxSeen = 0;
    let titleSeen = false;
    for (const f of drafts) {
      const n = f.html === '' ? 0 : countItems(f.html);
      expect(n, `步骤条数回退：${maxSeen} → ${n}`).toBeGreaterThanOrEqual(
        maxSeen,
      );
      maxSeen = n;
      if (f.html.includes('本周分享与跟进')) titleSeen = true;
      else if (titleSeen)
        throw new Error('标题出现后又消失了（闪烁）：' + f.html.slice(0, 80));
    }
    expect(maxSeen).toBe(3);
  });

  it('不重复渲染：任一帧只出一张卡；产物到齐后再不回到渐进卡', async () => {
    const frames = await collectFrames();
    // 每帧的 mode 是单值（函数返回单值即互斥），此处钉死序列形状：draft… → canvas…
    const firstCanvas = frames.findIndex((f) => f.mode === 'canvas');
    expect(firstCanvas).toBeGreaterThan(0);
    expect(frames.slice(firstCanvas).every((f) => f.mode === 'canvas')).toBe(
      true,
    );
    // 渐进卡与最终卡的 testid 不会同时出现在同一帧（同帧两张卡 = 重复渲染）
    for (const f of frames) {
      const hasDraftCard = f.html.includes(
        'data-testid="action-plan-card-draft"',
      );
      const hasFinalCard = f.html.includes('data-testid="action-plan-card"');
      expect(
        hasDraftCard && hasFinalCard,
        `同帧出现两张卡：state=${f.state}`,
      ).toBe(false);
    }
    // 且两张卡都确实在各自阶段出现过（否则上面的断言可以靠「一张都不出」空过）
    expect(
      frames.some((f) =>
        f.html.includes('data-testid="action-plan-card-draft"'),
      ),
    ).toBe(true);
    expect(
      frames.some(
        (f) =>
          f.html.includes('data-testid="action-plan-card"') &&
          !f.html.includes('data-testid="action-plan-card-draft"'),
      ),
    ).toBe(true);
  });

  it('🔒 渐进态渲染产物里没有任何闸门标注——即使流里 needsGate:true 已到达', async () => {
    const frames = await collectFrames();
    const drafts = frames.filter((f) => f.mode === 'draft');
    expect(drafts.length).toBeGreaterThan(0);
    for (const f of drafts) {
      expect(f.html).not.toContain('需你确认');
      expect(f.html).not.toContain('needsGate');
      expect(f.html).not.toContain('无需确认');
      expect(f.html).not.toContain('模型漏标');
    }
    // 反面对照：最终态（服务端复核后）**必须**标出来，否则就成了永久隐藏闸门
    const canvas = frames.filter((f) => f.mode === 'canvas');
    expect(canvas.length).toBeGreaterThan(0);
    expect(canvas[canvas.length - 1]!.html).toContain('需你确认');
  });

  it('渐进态明示「等服务端复核」而非默认无需确认（诚实措辞落在渲染产物上）', async () => {
    const frames = await collectFrames();
    const lastDraft = frames.filter((f) => f.mode === 'draft').pop()!;
    expect(lastDraft.html).toContain('拟定中');
    expect(lastDraft.html).toContain('复核');
  });
});

describe('F008-G4 · 空态与容错（渲染产物断言，非源码断言）', () => {
  const html = (input: unknown) =>
    renderToStaticMarkup(
      createElement(PlanCardDraft, { input: input as never }),
    );

  it('一个字都没写出来 → 渲染产物为空串（真·不出空壳卡）', () => {
    expect(html({})).toBe('');
    expect(html({ title: '   ' })).toBe('');
    expect(html({ items: [] })).toBe('');
    expect(html({ items: [{}, {}] })).toBe('');
    expect(html({ items: [{ needsGate: true }] })).toBe('');
  });

  it('只写出标题 → 出卡但零步骤行', () => {
    const out = html({ title: 'A' });
    expect(out).toContain('action-plan-card-draft');
    expect(countItems(out)).toBe(0);
  });

  it('脏 partial input（items 非数组 / 元素为 null / 标题非字符串）不抛不崩', () => {
    expect(() => html({ title: 123, items: 'not-an-array' })).not.toThrow();
    expect(() =>
      html({ title: 'A', items: [null, undefined, 5] }),
    ).not.toThrow();
    expect(() => html({ title: 'A', items: [{ title: null }] })).not.toThrow();
    expect(
      countItems(html({ title: 'A', items: [null, { title: 'x' }] })),
    ).toBe(1);
  });

  it('渐进卡不承接模型文本为 HTML（XSS 面：转义后输出）', () => {
    const out = html({ title: '<img src=x onerror=alert(1)>', items: [] });
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img');
  });
});

describe('F008-G4 · 覆盖面边界（对非渐进类工具零行为变化）', () => {
  it('全仓只有 propose_plan 注册了渐进渲染器', async () => {
    const { getNativeToolNames } = await import('lib/agent/tools');
    const names = getNativeToolNames();
    const withDraft = names.filter((n) => hasCanvasDraftRenderer(n));
    expect(withDraft).toEqual(['propose_plan']);
  });

  it('draft 类工具在任何状态下都不出渐进卡（裁决 D-F008-2 明确不渐进）', () => {
    for (const t of ['draft_email', 'refine_email', 'draft_report']) {
      for (const s of ['input-streaming', 'input-available']) {
        expect(pickToolRenderMode(t, s, undefined), `${t}/${s}`).toBe('label');
        expect(renderToolInputDraft(t, { title: 'x' })).toBeNull();
      }
    }
  });

  it('未知/无渲染器工具的原有分支未被改动', () => {
    expect(
      pickToolRenderMode('search_kols', 'input-streaming', undefined),
    ).toBe('label');
    expect(pickToolRenderMode('compute_roi', 'output-available', {})).toBe(
      'label',
    );
    expect(
      pickToolRenderMode('match_plan', 'output-available', {
        type: 'match_plan',
      }),
    ).toBe('canvas');
    expect(pickToolRenderMode('propose_plan', undefined, undefined)).toBe(
      'label',
    );
    expect(pickToolRenderMode('propose_plan', 'output-error', undefined)).toBe(
      'label',
    );
  });
});
