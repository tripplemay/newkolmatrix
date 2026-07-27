// M4.7-FRONTDESK 复验（reverifying）· Evaluator 独立探针
//
// 【与既有探针的关系】不复用 G1–G4 / 对抗复核任何断言。本文件只做三件首轮与
// fix 轮取证都够不到的事：
//   ① 撞顶告知的**字节产物落盘**，交给浏览器实测（渲染层是 vitest 的盲区）
//   ② 告知文案用**字面量**钉（仓内现有的 BUDGET_NOTICE_ANCHOR 断言与文案同源，
//      两边一起改就是同义反复——本会话已记录该类错误七次）
//   ③ 生产**默认**超时闸的常量→行为双向绑定（仓内全部超时用例都注入短闸，
//      生产默认路径零覆盖：实测摘掉默认闸后 1414 条全绿）
//
// 零外呼：模型 mock + fetch 哨兵全程在场。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';

const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as unknown[],
  fallback: null as unknown,
}));

vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/ai/gateway')
  >();
  return {
    ...actual,
    chatModel: () =>
      scriptedModel(
        seam.script as ScriptedStep[],
        (seam.fallback as ScriptedStep) ?? { text: '（脚本用尽）' },
      ),
  };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/agent/context')
  >();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { POST } from '../../src/app/api/agent/route';

const SLUG = `rv-${process.pid}-route`;
/** 撞顶告知的产物落盘位置——交给 Playwright 用**真字节**驱动浏览器。 */
export const BODY_DUMP = '/tmp/rv-budget-body.txt';
/** 对照组：自然收敛（无告知）的真字节，用于渲染层断言的活性证明。 */
export const BODY_DUMP_NONE = '/tmp/rv-nonotice-body.txt';

let tenantId: string;
let projectId: string;
const ledger: Record<string, unknown> = {};

const toolStep: ScriptedStep = {
  toolCalls: [
    {
      toolName: 'propose_plan',
      input: { title: 'rv', items: [{ title: 'rv-item', needsGate: false }] },
    },
  ],
};

async function postAgent(
  script: ScriptedStep[],
  fallback?: ScriptedStep,
): Promise<{ status: number; body: string; networkCalls: string[] }> {
  seam.script = script;
  seam.fallback = fallback ?? null;
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'rv 复验：一直查下去',
          context: {
            route: `/admin/campaigns/${projectId}`,
            projectId,
            env: 'default',
            agentId: 'reach',
            stage: 'reach',
          },
        }),
      }),
    );
    return {
      status: res.status,
      body: await res.text(),
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 复验 route 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `rv ${process.pid}` },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  } satisfies ToolContext;
});

afterAll(async () => {
  console.log('\n[m47-rv 观测台账]\n' + JSON.stringify(ledger, null, 2));
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [handoffs, shares, logs, pas, projects, tenants] = await Promise.all([
    prisma.handoff.count({ where: { tenantId } }),
    prisma.shareLink.count({ where: { tenantId } }),
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ handoffs, shares, logs, pas, projects, tenants }).toEqual({
    handoffs: 0,
    shares: 0,
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('RV · 撞顶告知：真 POST 字节 + 字面量锚点（不引用被测常量）', () => {
  it('RV-P1 撞顶 → 响应体含 data part，且告知正文是**字面量**匹配', async () => {
    const r = await postAgent([], toolStep);
    writeFileSync(BODY_DUMP, r.body, 'utf8');
    ledger['RV-P1.status'] = r.status;
    ledger['RV-P1.bytes'] = r.body.length;
    ledger['RV-P1.dumpedTo'] = BODY_DUMP;

    expect(r.status).toBe(200);
    expect(r.networkCalls).toEqual([]);
    // 【字面量，刻意不 import BUDGET_NOTICE_PART / BUDGET_NOTICE_ANCHOR】
    // 仓内既有断言两侧同源：改常量 = 两边一起改，绕过照样全绿。
    expect(r.body, '流内必须有撞顶告知 data part').toContain(
      'data-budget_notice',
    );
    expect(r.body, '告知正文必须如实说「没答完」').toContain(
      '我没答完就到步数上限了',
    );
    expect(r.body, '要给出补救指引').toContain('把问题拆小一点再问我一次');
    expect(
      r.body.slice(r.body.indexOf('data-budget_notice')),
      '不得出现与撞顶相反的完成态措辞（含「您」的写法）',
    ).not.toMatch(/已(完成|为你|为您|全部|办好)/);
  }, 60_000);

  it('RV-P2 自然收敛（末步出文本）→ 字节里没有告知（不误报）', async () => {
    const r = await postAgent([
      toolStep,
      toolStep,
      toolStep,
      toolStep,
      { text: 'rv 答完了。' },
    ]);
    writeFileSync(BODY_DUMP_NONE, r.body, 'utf8');
    ledger['RV-P2.hasNotice'] = r.body.includes('data-budget_notice');
    expect(r.body).not.toContain('data-budget_notice');
    expect(r.body).not.toContain('我没答完就到步数上限了');
    expect(r.body, '正向：答案确实到了（否则这条负向断言无意义）').toContain(
      'rv 答完了',
    );
  }, 60_000);
});
