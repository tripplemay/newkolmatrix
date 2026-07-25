// M4.5-AGENT-LOOP · Evaluator(G4) 取证脚本 — 打印 F008 渐进链路的逐帧实测形态。
// 只读，不写库、不外呼。用于验收报告的证据摘录（不进 CI）。

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// tsx 以 classic JSX runtime 转译产品 .tsx —— 脚本侧补上全局 React（不改产品代码）。
(globalThis as unknown as { React: unknown }).React = React;
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import {
  pickToolRenderMode,
  renderToolInputDraft,
  renderToolResult,
} from '../../src/components/copilot/canvas/canvas-registry';

const ID = 'g4-tc-1';
const JSON_INPUT = JSON.stringify({
  title: 'G4 探针：本周分享与跟进',
  items: [
    { title: '先算一遍组合 ROI', toolName: 'compute_roi_portfolio', needsGate: false },
    { title: '生成季度分享链接', toolName: 'create_share_link', needsGate: true },
    { title: '把周报发出去', toolName: 'draft_report', needsGate: true },
  ],
});

function slices(s: string, n: number): string[] {
  const size = Math.ceil(s.length / n);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

const chunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'g4-m1' },
  { type: 'start-step' },
  { type: 'tool-input-start', toolCallId: ID, toolName: 'propose_plan' },
  ...slices(JSON_INPUT, 18).map(
    (d): UIMessageChunk => ({
      type: 'tool-input-delta',
      toolCallId: ID,
      inputTextDelta: d,
    }),
  ),
  {
    type: 'tool-input-available',
    toolCallId: ID,
    toolName: 'propose_plan',
    input: JSON.parse(JSON_INPUT),
  },
  {
    type: 'tool-output-available',
    toolCallId: ID,
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

const stream = new ReadableStream<UIMessageChunk>({
  start(c) {
    for (const k of chunks) c.enqueue(k);
    c.close();
  },
});

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
let i = 0;
for await (const msg of readUIMessageStream({ stream })) {
  const part = (
    msg.parts as Array<{
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
  const html = el ? renderToStaticMarkup(el) : '';
  const items = (html.match(/<li /g) ?? []).length;
  console.log(
    `帧${String(++i).padStart(2)} state=${String(part.state).padEnd(16)} mode=${mode.padEnd(6)} 步骤=${items} 闸门字样=${html.includes('需你确认') ? 'YES' : 'no '} :: ${textOf(html).slice(0, 92)}`,
  );
}
}

void main();
