// M3-B-DELIVERY F004 — partner env 选择器
//
// ── 与 ops/email 选择器的差异（acceptance 要求明文理由）──
//
// `ops/email` 是三分支：真实现 / mock / **prod 无 key fail-fast 拒发**。那条 fail-fast 的前提是
// 「本项目确实有真实发信实现」——prod 缺 key 意味着「本该发出去的信静默消失在一条 mock 日志里」，
// 必须炸。
//
// 本层**没有任何真实现**（U2/P1：本批不接真实付款与 key 平台）。此时 prod fail-fast 毫无收益：
// 它只会让生产环境的交付功能整体不可用，却挡不住任何"本该真发生却没发生"的事——因为根本
// 不存在"本该真发生"的路径。所以本批选择器：**恒 mock，prod 也不 fail-fast**。
//
// M5 接真时的改法（写在这里，避免届时重新推理）：
//   ① 新增 RealEscrowPartner / RealKeyDistributor 两实现
//   ② 本文件加 key 分支：有 key → 真实现；无 key + 非 prod → mock；**无 key + prod → 抛错**
//   ③ 那一刻起 fail-fast 才有意义（真实现存在 = 缺配置等于资金动作静默丢失）
//
// 另一条诚实纪律：若有人把 `ESCROW_PARTNER_PROVIDER` 配成 mock 以外的值（期待真实行为），
// 选择器**明示拒绝**而不是静默回落 mock——「以为在真放款、其实只写了条日志」是最坏的失败模式。

import { MockEscrowPartner } from './mock-escrow';
import { MockKeyDistributor } from './mock-key-distributor';
import { PartnerError, type EscrowPartner, type KeyDistributor } from './types';

/** 本批唯一受支持的 provider 取值。 */
const MOCK_PROVIDER = 'mock';

function assertProviderSupported(varName: string, value: string | undefined) {
  if (!value || value === MOCK_PROVIDER) return;
  throw new PartnerError(
    'not_implemented',
    `${varName}=${value} 未实装——本批只有 mock 适配器（U2/P1：零真实资金动作）。` +
      `需要真实 partner 请走 M5 接真批次，不要指望这里静默回落 mock。`,
  );
}

export function getEscrowPartner(): EscrowPartner {
  assertProviderSupported(
    'ESCROW_PARTNER_PROVIDER',
    process.env.ESCROW_PARTNER_PROVIDER,
  );
  return new MockEscrowPartner();
}

export function getKeyDistributor(): KeyDistributor {
  assertProviderSupported(
    'KEY_DISTRIBUTOR_PROVIDER',
    process.env.KEY_DISTRIBUTOR_PROVIDER,
  );
  return new MockKeyDistributor();
}

export { MockEscrowPartner, RELEASED_MARKER } from './mock-escrow';
export { MockKeyDistributor, DISTRIBUTED_MARKER } from './mock-key-distributor';
export * from './types';
