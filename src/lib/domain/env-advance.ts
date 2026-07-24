// M1-A-BRIEF F006 — 环节推进（服务端强制那一半）。
//
// architecture.md:563 要求守卫在【页面与工具层双重执行】。本批做服务端这一半：
// 任何走本函数的推进都必经 env-guards 判定，绕不过去。页面半边归 M1-B。
//
// 与 env-guards.ts 的分工：那边是纯判定（无副作用、可穷举测试），
// 这边是唯一的写入点（读状态 → 判定 → 事务落库 + 留痕）。判定逻辑不在这里重复实现。
//
// ⚠️ 为什么必须写 OperationLog：北极星「操盘手杠杆」= 环节推进事件计数 × 周活
//    （architecture.md:1695），而 ADR-21 明确不建 EventStore（:539）——
//    不写在这里就没有任何地方存，且【永久不可补录】（事件过去了就是过去了）。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { STAGE_LABEL, type Stage } from 'lib/agent/stage-routing';
import { parseProjectGoal } from 'lib/data/schemas/project';
import {
  canAdvance,
  nextStage,
  raiseMaxReached,
  type EnvGuardReason,
} from './env-guards';

/** 推进结果。被守卫拒绝时 `ok=false` 且 `reason` 非空，且**没有**写任何日志。 */
export interface AdvanceResult {
  ok: boolean;
  reason: EnvGuardReason | 'PROJECT_NOT_FOUND' | null;
  /** 推进后的游标（被拒时为当前值，不变） */
  cur: Stage;
  maxReached: Stage;
  /** 本次写入的 OperationLog id；未推进则为 null */
  logId: string | null;
}

export interface AdvanceStageOpts {
  projectId: string;
  tenantId: string;
  /** 发起方（OperationLog.actor）。默认编排 Agent */
  actor?: string;
}

/**
 * 把项目 `cur` 推进到下一环节，并留痕。
 *
 * 事务语义：项目状态更新与留痕写入同一事务——要么都成功要么都回滚。
 * 推进发生了却没记上，北极星指标就永久缺一条且无从补录；
 * 记上了却没推进，指标就是虚的。两种都不可接受，故绑在一起。
 */
export async function advanceStage(
  opts: AdvanceStageOpts,
): Promise<AdvanceResult> {
  const { projectId, tenantId, actor = 'orchestrator' } = opts;

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, name: true, cur: true, maxReached: true, goal: true },
  });

  if (!project) {
    return {
      ok: false,
      reason: 'PROJECT_NOT_FOUND',
      cur: 'brief',
      maxReached: 'brief',
      logId: null,
    };
  }

  const cur = project.cur as Stage;
  const maxReached = project.maxReached as Stage;

  // M2-A F004：→reach 判据（守卫保持纯函数，存在性在此调用点查好传入）。
  // 恒查不按 next 分支：单索引 count 查询廉价，分支反而引入「漏组装」缺口。
  const approvedPlan = await prisma.matchPlan.findFirst({
    where: { projectId, status: 'approved' },
    select: { id: true },
  });

  // M3-B F010：→delivery / →insight 判据（同上，恒查不按 next 分支——一次轻量 groupBy
  // 换「不可能漏组装」）。settled = completed / defaulted；零 Deal 亦算收尾（P12 空态诚实）。
  const dealStatuses = await prisma.deal.findMany({
    where: { projectId, tenantId },
    select: { status: true },
  });
  const hasDeal = dealStatuses.length > 0;
  const allDealsSettled = dealStatuses.every(
    (d) => d.status === 'completed' || d.status === 'defaulted',
  );

  const guard = canAdvance({
    cur,
    maxReached,
    goal: parseProjectGoal(project.goal),
    hasApprovedMatchPlan: approvedPlan != null,
    hasDeal,
    allDealsSettled,
  });

  // 守卫拒绝：不写日志，只回理由（acceptance 明令「守卫拒绝的推进不写日志」）。
  // 失败的尝试不是「操盘手杠杆」事件，记进去会把北极星指标掺水。
  if (!guard.allowed) {
    return { ok: false, reason: guard.reason, cur, maxReached, logId: null };
  }

  const to = nextStage(cur);
  // canAdvance 放行即意味着存在下一环节（末环节走 ALREADY_AT_FINAL_STAGE 分支被拒），
  // 这里的判空是类型收窄兼防御。
  if (to == null) {
    return {
      ok: false,
      reason: 'ALREADY_AT_FINAL_STAGE',
      cur,
      maxReached,
      logId: null,
    };
  }

  // 单调不减只在 raiseMaxReached 一处实现（F005），这里不重复写比较逻辑。
  const maxReachedAfter = raiseMaxReached(maxReached, to);

  const payload = {
    from: cur,
    to,
    maxReachedBefore: maxReached,
    maxReachedAfter,
  };

  const [, log] = await prisma.$transaction([
    prisma.project.update({
      where: { id: project.id },
      data: { cur: to, maxReached: maxReachedAfter },
    }),
    prisma.operationLog.create({
      data: {
        tenantId,
        // architecture.md:800 定义 auto = 工具直接执行的可逆动作。
        // 环节推进正是可逆的（D2 双值就是为支持 cur 回退），故取 auto，不扩枚举。
        kind: 'auto',
        actor,
        // summary 是展示契约（mock/runs.ts:5 + Agent 记录页直渲），只放人话；
        // 结构化数据一律走 payloadJson，不塞这里。
        summary: `项目「${project.name}」环节推进：${STAGE_LABEL[cur]} → ${STAGE_LABEL[to]}`,
        projectId: project.id,
        payloadJson: payload as Prisma.InputJsonValue,
        // ref 不填：它专指 PendingAction.id（architecture.md:1358），语义单一（D13）
      },
      select: { id: true },
    }),
  ]);

  return {
    ok: true,
    reason: null,
    cur: to,
    maxReached: maxReachedAfter,
    logId: log.id,
  };
}
