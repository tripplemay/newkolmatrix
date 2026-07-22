// M1-B-BRIEF F004 — EnvGuardReason → 中文 toast 文案（D4/D8）。
//
// M1-A D8 把拒绝理由定为字符串字面量联合（领域层无 i18n 耦合），文案映射明写
// 「留展示层归 M1-B」——本文件兑现，且是**单点**：任何页面/组件要把守卫拒绝
// 理由念给人听，都从这里取，不得散落第二份映射。
//
// Record<EnvGuardReason, string> 全量覆盖：新增 reason 时 tsc 在此报错，防漏配。

import type { EnvGuardReason } from 'lib/domain/env-guards';

export const ENV_GUARD_MESSAGE: Record<EnvGuardReason, string> = {
  STAGE_NOT_UNLOCKED: '该环节尚未解锁，项目推进到此处后即可进入',
  BRIEF_GOAL_NOT_CONFIRMED: '目标尚未确认，请先在「目标 Brief」环节完成确认',
  MATCH_PLAN_NOT_APPROVED:
    '尚无已批准的匹配组合，请先在「匹配」环节批准一组方案',
  DEPENDENCY_NOT_IMPLEMENTED: '该流转的前置能力尚未接入，暂不可推进',
  ALREADY_AT_FINAL_STAGE: '已在最后一个环节，没有可推进的下一步',
  INVARIANT_VIOLATED: '项目环节状态异常，请刷新页面后重试',
};
