// M1-B-BRIEF F005 — 健康度档位中文 label（D6 收敛单点）。
//
// 收敛前 HEALTH_LABEL 有两份副本（mock/projects.ts × today/page.tsx），本文件是
// 唯一 canonical：任何页面要把 gd/wn/cr 念给人听，都从这里 import，不得再抄一份。
// 文案留展示层不入 domain（D9/D6）——domain/health.ts 保持纯逻辑无 i18n 耦合。
//
// Record<HealthBand, string> 全量覆盖：档位增减时 tsc 在此报错，防漏配。

import type { HealthBand } from 'lib/domain/health';

export const HEALTH_LABEL: Record<HealthBand, string> = {
  gd: '正常',
  wn: '注意',
  cr: '风险',
};
