// ARCH-M05 F007 — 五环节元数据（原型 interaction-prototype-v2.html ENVS L538-544 逐字移植）
//
// 环节名 / 语法徽标 / 动词句 / 图标的唯一出处：服务 V2 rc-foot「停在「{环节}」」、
// V3 导轨（rn-ico/rn-name）与 surf-label 语法徽标；F008-F012 各语法面沿用，不复制。
// 图标映射与 copilot/ActionCard ICONS 同族（target/users/mail/ledger/chart）。

import type { IconType } from 'react-icons';
import {
  MdGroups,
  MdInsights,
  MdMailOutline,
  MdOutlineGpsFixed,
  MdOutlineReceiptLong,
} from 'react-icons/md';
import type { Stage } from 'lib/agent/stage-routing';

export interface EnvMeta {
  /** 环节名（原型 e.name，rail rn-name / rc-foot 用） */
  name: string;
  /** 界面语法徽标（原型 e.grammar，surf-label .tag 用；FR-7.10 五套语法互不相同） */
  grammar: string;
  /** 动词句（原型 e.verb，surf-label desc 前半句） */
  verb: string;
  icon: IconType;
}

export const ENV_META: Record<Stage, EnvMeta> = {
  brief: {
    name: '目标 Brief',
    grammar: '态势简报',
    verb: '看方向对不对',
    icon: MdOutlineGpsFixed,
  },
  match: {
    name: '创作者匹配',
    grammar: '对比矩阵',
    verb: '比较并批准一组',
    icon: MdGroups,
  },
  reach: {
    name: '触达谈判',
    grammar: '对话收件箱',
    verb: '逐人谈判推进',
    icon: MdMailOutline,
  },
  delivery: {
    name: '交付结算',
    grammar: '条件台账',
    verb: '逐笔核对放款',
    icon: MdOutlineReceiptLong,
  },
  insight: {
    name: '复盘洞察',
    grammar: '对照账本',
    verb: '对账原目标',
    icon: MdInsights,
  },
};
