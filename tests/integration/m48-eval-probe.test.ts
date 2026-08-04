// M4.8-HARDEN 复验探针（Evaluator 自建，非 Generator 产物）
//
// 【补的是哪一格】F004 的负向面 acceptance 点名三条：正常完成 / budget 截停 /
// 非超时 abort。实物里还有第四条路径 —— **模型抛错的异常收场**：那时 `onEnd`
// 不触发，而墙钟闸的定时器还在走。loop.ts 用 `result.finishReason.then(markSettled,
// markSettled)` 兜了这一刀，但复验实测该兜底**没有任何测试钉着**：摘掉它，
// loop-timeout-notice.test.ts 8/8 照样全绿。
//
// 后果不是理论的：一个 3 秒就失败的会话会在 110 秒后凭空多出一条"超时"留痕，
// 外加一句写进已关闭流的告知 —— 与负向① 完全同族的误报，只是入口是错误而非成功。
//
// 零外呼：模型是 mock（立即 reject），遥测 writer 注入空实现（不落库、不建夹具）。

import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { runAgentLoop, type LoopTimeoutEvent } from '../../src/lib/agent/loop';
import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';

/** 与 `AbortSignal.timeout()` 同 reason 的手动中止（确定性，不睡 110 秒）。 */
function timeoutReason(): DOMException {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}

const copilot: CopilotContext = {
  route: '/admin',
  projectId: null,
  env: 'default',
  agentId: FRONT_DESK_AGENT_ID,
};

/** 纯内存 ctx：不打库、不建夹具（本文件零 DB 写入）。 */
const ctx = (): ToolContext => ({
  tenantId: 'm48-eval-probe-tenant',
  agentId: FRONT_DESK_AGENT_ID,
  projectId: null,
  env: 'default',
  consultBudget: { used: 0, max: 2 },
});

describe('F004 负向④（复验补钉）：模型抛错的异常收场不得被追认为超时', () => {
  it('会话因模型错误收场后，闸到点也不得触发 onLoopTimeout', async () => {
    const events: LoopTimeoutEvent[] = [];
    const controller = new AbortController();
    const sentinel = installNoNetworkSentinel();
    try {
      const loop = await runAgentLoop({
        copilot,
        messages: [{ role: 'user', content: '这次会失败' }],
        model: new MockLanguageModelV4({
          doStream: async () => {
            throw new Error('m48-eval-probe: 网关拒答');
          },
        }),
        ctx: ctx(),
        abortSignal: controller.signal,
        telemetryWriter: async () => {}, // 不落库
        onLoopTimeout: (e) => events.push(e),
      });
      try {
        for await (const _ of loop.result.fullStream) void _;
      } catch {
        /* 错误路径预期抛 */
      }
      // 前提：会话确实是以失败收场的
      await expect(loop.result.finishReason).rejects.toBeTruthy();
    } finally {
      sentinel.restore();
    }
    expect(events, '会话进行中不该有超时').toEqual([]);

    // 让墙钟闸事后到点（生产上就是 110 秒后那一刀）
    controller.abort(timeoutReason());
    await new Promise((res) => setTimeout(res, 20));

    expect(
      events,
      '已经失败收场的会话在闸到点后被报成"超时中断" —— 与负向① 同族的误报（入口是错误而非成功）',
    ).toEqual([]);
    expect(sentinel.calls, '零外呼').toEqual([]);
  }, 20_000);
});
