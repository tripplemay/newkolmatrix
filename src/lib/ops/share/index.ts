// M4-INSIGHT F007 — share env 选择器
//
// ── 与 ops/email 选择器的差异（acceptance 要求明文理由）──
//
// `ops/email` 是三分支：真实现 / mock / **prod 无 key fail-fast 拒发**。那条 fail-fast 的前提是
// 「本项目确实有真实发信实现」——prod 缺 key 意味着「本该发出去的信静默消失在一条 mock 日志里」，
// 必须炸。
//
// 本层**没有任何真实现**（U2/P4：本批零真实公开暴露，真实公开分享页/CDN 留 M5）。此时 prod
// fail-fast 毫无收益：它只会让洞察分享功能整体不可用，却挡不住任何「本该真发生却没发生」的事
// ——因为根本不存在「本该真发生」的路径。所以本批选择器：**恒 mock，prod 无 key 也不
// fail-fast；M5 接真才启**（同 ops/partner 口径）。
//
// M5 接真时的改法（写在这里，避免届时重新推理）：
//   ① 新增 RealShareLinkService（公开分享页 / CDN 发布）
//   ② 本文件加 key 分支：有 key → 真实现；无 key + 非 prod → mock；**无 key + prod → 抛错**
//   ③ 真实现若走 fetch，超时必须 AbortController 真中断（partner 文件头规矩延续，不抄
//      resend-sender 的 race——见 types.ts 硬要求清单 ①）
//
// 另一条诚实纪律（同 partner）：若有人把 `SHARE_LINK_PROVIDER` 配成 mock 以外的值（期待真实
// 行为），选择器**明示拒绝**而不是静默回落 mock——「以为生成了真实分享链接、其实只写了条日志」
// 是最坏的失败模式。

import { MockShareLinkService } from './mock-share-link';
import { ShareError, type ShareLinkService } from './types';

/** 本批唯一受支持的 provider 取值。 */
const MOCK_PROVIDER = 'mock';

export function getShareLinkService(): ShareLinkService {
  const value = process.env.SHARE_LINK_PROVIDER;
  if (value && value !== MOCK_PROVIDER) {
    throw new ShareError(
      'not_implemented',
      `SHARE_LINK_PROVIDER=${value} 未实装——本批只有 mock 适配器（U2/P4：零真实公开暴露）。` +
        `需要真实公开分享页/CDN 请走 M5 接真批次，不要指望这里静默回落 mock。`,
    );
  }
  return new MockShareLinkService();
}

export { MockShareLinkService, SHARE_CREATED_MARKER } from './mock-share-link';
export * from './types';
