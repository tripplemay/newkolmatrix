'use client';
// ARCH-M05 F003 — S3-16 生成式动作卡（原型 .act：icon 圆 40 + 标题/副文 + chev，hover translateX）。
// 三类跳转（原型 copAct，L1100-1104）：
//   enter:{pid}:{env} → 进项目并直落该环节；pick:{creatorId} → 直落触达对话（mock 固定星轨协议）；
//   env:{env}         → 当前项目切环节（不在项目内时落 mock 项目）。
// 环节参数沿用现行 ?stage= 契约（?env= 迁移归 F007，spec 附录 A #2）。

import { usePathname, useRouter } from 'next/navigation';
import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdChevronRight,
  MdFolderOpen,
  MdGroups,
  MdInsights,
  MdMailOutline,
  MdNotificationsNone,
  MdOutlineGpsFixed,
  MdOutlineReceiptLong,
} from 'react-icons/md';

export type ActionIcon =
  | 'target'
  | 'users'
  | 'mail'
  | 'ledger'
  | 'chart'
  | 'spark'
  | 'bell'
  | 'folder';

export interface CopilotAction {
  icon: ActionIcon;
  title: string;
  sub: string;
  /** 跳转指令：enter:{pid}:{env} | pick:{creatorId} | env:{env} */
  go: string;
}

const ICONS: Record<ActionIcon, IconType> = {
  target: MdOutlineGpsFixed,
  users: MdGroups,
  mail: MdMailOutline,
  ledger: MdOutlineReceiptLong,
  chart: MdInsights,
  spark: MdAutoAwesome,
  bell: MdNotificationsNone,
  folder: MdFolderOpen,
};

// ARCH-M05 mock — pick:/env: 不在项目上下文时落的演示项目（原型 state.pid='xg' 星轨协议）。
const MOCK_PROJECT_ID = 'xg';

/** go 指令 → href；未知指令返回 null（卡片降级为不可跳转）。 */
export function resolveActionHref(go: string, pathname: string): string | null {
  const [kind, ...rest] = go.split(':');
  if (kind === 'enter' && rest.length >= 2) {
    const [pid, env] = rest;
    return `/admin/campaigns/${pid}?stage=${env}`;
  }
  if (kind === 'pick' && rest.length >= 1) {
    return `/admin/campaigns/${MOCK_PROJECT_ID}?stage=reach&pick=${rest[0]}`;
  }
  if (kind === 'env' && rest.length >= 1) {
    const m = pathname.match(/^\/admin\/campaigns\/([^/?]+)/);
    const pid = m ? m[1] : MOCK_PROJECT_ID;
    return `/admin/campaigns/${pid}?stage=${rest[0]}`;
  }
  return null;
}

export default function ActionCard({ action }: { action: CopilotAction }) {
  const router = useRouter();
  const pathname = usePathname();
  const Icon = ICONS[action.icon] ?? MdAutoAwesome;
  return (
    <button
      type="button"
      onClick={() => {
        const href = resolveActionHref(action.go, pathname ?? '/admin');
        if (href) router.push(href);
      }}
      className="flex w-full items-center gap-3 rounded-[14px] border border-gray-200 bg-white p-3 text-left transition duration-150 hover:translate-x-0.5 hover:shadow-xl dark:border-white/10 dark:bg-navy-700"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lightPrimary text-brand-500 dark:bg-navy-900 dark:text-brand-400">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-compact font-bold text-navy-700 dark:text-white">
          {action.title}
        </b>
        <span className="block truncate text-micro text-gray-600 dark:text-gray-400">
          {action.sub}
        </span>
      </span>
      <MdChevronRight size={18} className="shrink-0 text-gray-400" />
    </button>
  );
}
