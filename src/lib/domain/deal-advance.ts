// M3-B-DELIVERY F003 — Deal 资金状态机（纯函数，architecture §5.3③ 资金生命周期）。
//
// 主线（architecture :507）：negotiating → signed → escrowed → delivering → completed
// 分支：任一运行态 → blocked（争议 / 暂停，**可恢复**）· 任一非 completed 态 → defaulted（违约，**终态**）
//
// 纯函数：不读 DB、无副作用、不 import prisma client——可被单测穷举（crm-infer / env-guards 先例）。
// 写侧唯一入口是 `lib/delivery/deal-status.ts`（有 DB 的物化壳），任何调用方不得绕过本函数
// 直接 `deal.update({ status })`——那等于把状态机作废。
//
// D20：状态机类必须配变异测试（tests/unit/deal-advance.test.ts）。
//
// ── 不变量（变异测试盯的就是这几条）──
// ① 不得跳态：negotiating → delivering / escrowed / completed 一律拒绝（每一步都有其业务前提：
//    签约 → 托管到账 → 交付进行 → 交付完成，跳过任一步意味着前提未被核实）
// ② 不得倒流：completed → delivering 之类的回退拒绝（审计链单向；纠错走人工核验与留痕，不改状态机）
// ③ completed 是终态：出边为空（放款完成后不再有资金动作）
// ④ defaulted 是终态：出边为空（违约收尾；如需重启合作应建新 Deal，不复活旧行）
// ⑤ blocked 可恢复：blocked → 四个运行态之一（恢复到哪一态由调用方按实物判断并留痕），
//    也可 blocked → defaulted（争议未果转违约）。**blocked → completed 拒绝**——
//    恢复后必须重新走 delivering，不得从争议态一步跳到完成。

/** Deal 七态（与 Prisma enum `DealStatus` 字面量逐字一致；本地定义保持 domain 层零依赖）。 */
export type DealStatus =
  | 'negotiating'
  | 'signed'
  | 'escrowed'
  | 'delivering'
  | 'completed'
  | 'blocked'
  | 'defaulted';

/** 主线推进序（相邻才合法——不变量 ①②）。 */
export const DEAL_FLOW_ORDER = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
  'completed',
] as const;

/** 运行态（可被 blocked 打断、也是 blocked 的恢复目标集）。 */
export const DEAL_RUNNING_STATUSES = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
] as const;

/** 终态（出边为空）。 */
export const DEAL_TERMINAL_STATUSES = ['completed', 'defaulted'] as const;

/** 拒绝原因码（字面量联合：调用方要据此分支提示与留痕，自由文本不可分支）。 */
export type DealAdvanceReason =
  /** 合法流转 */
  | 'OK'
  /** 目标态 = 当前态（no-op：调用方应跳过写库，不是错误但也不算推进） */
  | 'SAME_STATE'
  /** 当前态是终态，无任何出边 */
  | 'TERMINAL_STATE'
  /** 跳过了主线中间态（不变量 ①） */
  | 'SKIPPED_STAGE'
  /** 主线倒流（不变量 ②） */
  | 'BACKWARD'
  /** 其余非法组合（如 blocked → completed） */
  | 'ILLEGAL_TRANSITION'
  /** 取值不在七态内（不信任外部数据：不把未知值当合法态放行） */
  | 'UNKNOWN_STATE';

export interface DealAdvanceResult {
  allowed: boolean;
  from: DealStatus;
  to: DealStatus;
  reason: DealAdvanceReason;
}

function flowIndex(status: DealStatus): number {
  return (DEAL_FLOW_ORDER as readonly string[]).indexOf(status);
}

function isKnown(status: string): status is DealStatus {
  return (
    (DEAL_FLOW_ORDER as readonly string[]).includes(status) ||
    status === 'blocked' ||
    status === 'defaulted'
  );
}

function isRunning(status: DealStatus): boolean {
  return (DEAL_RUNNING_STATUSES as readonly string[]).includes(status);
}

function isTerminal(status: DealStatus): boolean {
  return (DEAL_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * 判定一次 Deal 状态流转是否合法（文件头注释 = 完整规则）。
 *
 * 纯函数：不修改入参、同输入必同输出；返回全新对象。
 * 非法流转**不抛错**——返回带 reason 的结果，由调用方决定是拒绝请求（API 400）
 * 还是静默跳过（幂等重入命中 SAME_STATE）。
 */
export function dealAdvance(from: string, to: string): DealAdvanceResult {
  if (!isKnown(from) || !isKnown(to)) {
    return {
      allowed: false,
      from: from as DealStatus,
      to: to as DealStatus,
      reason: 'UNKNOWN_STATE',
    };
  }

  const deny = (reason: DealAdvanceReason): DealAdvanceResult => ({
    allowed: false,
    from,
    to,
    reason,
  });

  if (from === to) return deny('SAME_STATE');
  if (isTerminal(from)) return deny('TERMINAL_STATE');

  // 分支边：运行态 / blocked → defaulted 恒合法（违约可在任何未完成阶段发生）
  if (to === 'defaulted') return { allowed: true, from, to, reason: 'OK' };
  // 运行态 → blocked 恒合法（争议 / 暂停可在任何进行中阶段发生）
  if (to === 'blocked') {
    return isRunning(from)
      ? { allowed: true, from, to, reason: 'OK' }
      : deny('ILLEGAL_TRANSITION');
  }

  // blocked 恢复：只能回到运行态（不变量 ⑤：blocked → completed 拒绝）
  if (from === 'blocked') {
    return isRunning(to)
      ? { allowed: true, from, to, reason: 'OK' }
      : deny('ILLEGAL_TRANSITION');
  }

  // 主线：只有相邻的下一步合法
  const fi = flowIndex(from);
  const ti = flowIndex(to);
  if (ti === fi + 1) return { allowed: true, from, to, reason: 'OK' };
  return deny(ti < fi ? 'BACKWARD' : 'SKIPPED_STAGE');
}

/** 主线下一态（终态与 blocked 无主线后继 → null）。供调用方「推进一步」时取目标态。 */
export function nextDealStatus(from: DealStatus): DealStatus | null {
  const i = flowIndex(from);
  if (i < 0 || i >= DEAL_FLOW_ORDER.length - 1) return null;
  return DEAL_FLOW_ORDER[i + 1];
}

/**
 * 已达到（或越过）某主线阶段。用于「登记 refs 时状态推进」的幂等判断：
 * 已 escrowed 的 Deal 再登记 contractRef 不该把状态拉回 signed（不变量 ②）。
 * blocked / defaulted 不在主线上 → 恒 false（调用方须显式处理分支态）。
 */
export function hasReachedDealStage(
  current: DealStatus,
  stage: (typeof DEAL_FLOW_ORDER)[number],
): boolean {
  const ci = flowIndex(current);
  const si = flowIndex(stage);
  if (ci < 0 || si < 0) return false;
  return ci >= si;
}
