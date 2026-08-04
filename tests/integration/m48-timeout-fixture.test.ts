// M4.8-HARDEN F005 — 超时告知的**字节样本落盘**（浏览器级钉的前置）
//
// 【它为什么单独成文件】vitest 固定 environment:'node'（无 jsdom），断不了「这条 part
// 是否真的被 React 渲染成用户看得见的东西」——R-2 的原话「写进流 ≠ 用户看得见」。
// 渲染层那一段交给 tests/visual/rv-timeout-notice.spec.ts，本文件只负责把**真 route
// 产出的字节**落盘给它回放。零外呼：模型是 mock，全程挂 fetch 哨兵。
//
// 【串进 CI 的方式】package.json 的 `test:visual:fixtures` 跑本文件（与 m47-rv-probe
// 并列），`test:visual` 先跑 fixtures 再跑 playwright，CI 的 visual job 跑 `test:visual`。
// M4.7 规律 3：收编测试钉必须核到 CI 那一层——样本没落盘时 spec 是**红**不是 skip
//（S-RV2-9：skip 掉等于这条钉子不存在）。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';
import { waitForLogSettle } from '../support/log-settle';

const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  model: null as unknown,
  /** 生产默认闸缩到 1.5s —— 样本必须走**默认路径**产出（不注入 signal）。 */
  gateMs: 1_500,
}));

vi.mock('../../src/lib/agent/registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/registry')>();
  return { ...actual, LOOP_TIMEOUT_MS: seam.gateMs };
});

vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return { ...actual, chatModel: () => seam.model };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/context')>();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import { POST } from '../../src/app/api/agent/route';

/** 超时告知的真字节（交给 Playwright 回放给真浏览器）。 */
export const TIMEOUT_BODY_DUMP = '/tmp/m48-timeout-body.txt';
/** 对照组：正常收敛（无告知）的真字节 —— 渲染层断言的活性证明。 */
export const TIMEOUT_BODY_DUMP_NONE = '/tmp/m48-notimeout-body.txt';

const SLUG = `test-tenant-m48-fixture-${process.pid}`;
let tenantId: string;
let projectId: string;
const ledger: Record<string, unknown> = {};

const toolStep: ScriptedStep = {
  toolCalls: [
    {
      toolName: 'propose_plan',
      input: { title: 'm48', items: [{ title: 'm48-item', needsGate: false }] },
    },
  ],
};

/** 前 `afterSteps` 步正常跑，之后挂死到 abort（这正是"挂死"的形状）。 */
function stallingStreamModel(afterSteps: number): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: (options) => {
      const i = calls++;
      if (i < afterSteps) return scriptedModel([toolStep]).doStream(options);
      return new Promise((_resolve, reject) => {
        const sig = (options as { abortSignal?: AbortSignal }).abortSignal;
        if (!sig) return;
        if (sig.aborted) return reject(sig.reason);
        sig.addEventListener('abort', () => reject(sig.reason), { once: true });
      });
    },
  });
}

async function postAgent(): Promise<{ status: number; body: string; calls: string[] }> {
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'm48 样本：这个问题很慢',
          context: { route: '/admin', projectId, env: 'default' },
        }),
      }),
    );
    return { status: res.status, body: await res.text(), calls: sentinel.calls };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.8 样本夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.8 样本项目 ${process.pid}` },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    consultBudget: { used: 0, max: 2 },
  } satisfies ToolContext;
});

afterAll(async () => {
  console.log('\n[m48-fixture 观测台账]\n' + JSON.stringify(ledger, null, 2));
  // 清理登记表（spec §4）：Tenant / Project / OperationLog / PendingAction
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ logs, pas, projects, tenants }).toEqual({
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('F005 前置 · 超时告知的真字节样本落盘', () => {
  it('超时会话 → 落盘含 data-timeout_notice 的真字节', async () => {
    seam.model = stallingStreamModel(1); // 第 1 步跑完，第 2 步挂死到闸响
    const r = await postAgent();
    writeFileSync(TIMEOUT_BODY_DUMP, r.body, 'utf8');
    ledger['F005.timeout.bytes'] = r.body.length;
    ledger['F005.timeout.dumpedTo'] = TIMEOUT_BODY_DUMP;

    expect(r.status).toBe(200);
    expect(r.calls, '零外呼').toEqual([]);
    expect(r.body, '样本必须真的带告知，否则浏览器那条断言测的是空气').toContain(
      'data-timeout_notice',
    );
    expect(r.body).toContain('本次回答超时中断了');

    // 清理前等留痕/遥测都落完（S-RV2-10 同族：不等就删租户 → 孤儿行 / 迟到打红）
    await waitForLogSettle(tenantId);
  }, 30_000);

  it('正常收敛 → 落盘**不含**告知的对照字节（活性证明用）', async () => {
    seam.model = scriptedModel([toolStep, { text: 'm48 答完了。' }]);
    const r = await postAgent();
    writeFileSync(TIMEOUT_BODY_DUMP_NONE, r.body, 'utf8');
    ledger['F005.none.hasNotice'] = r.body.includes('data-timeout_notice');
    ledger['F005.none.dumpedTo'] = TIMEOUT_BODY_DUMP_NONE;

    expect(r.status).toBe(200);
    expect(r.calls).toEqual([]);
    expect(r.body).not.toContain('data-timeout_notice');
    expect(r.body, '正向：答案确实到了（否则那条负向断言无意义）').toContain(
      'm48 答完了',
    );

    // 同上：遥测也是 fire-and-forget，清理前等它落完
    await waitForLogSettle(tenantId);
  }, 30_000);
});
