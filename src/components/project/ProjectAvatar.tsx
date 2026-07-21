// ARCH-M05 F007 — avatar 色轮（原型 avatar() L672 + AVC 6 色轮 L559）：
// 名称首二字 + 按行序取 6 色轮。与 F006 today 同规格（并行 worktree 各自实现，
// 汇合后如需可收敛 common/ProjectAvatar——本件放 components/project/ 避免并行文件集重叠）。
// 色轮 6 hex 为原型数据色（同 agent-theme / 图表色的本地色表用法），非样式 token 漂移。

import React from 'react';

const AVATAR_WHEEL = [
  '#422afb',
  '#01b574',
  '#ffb547',
  '#3965ff',
  '#ee5d50',
  '#7551ff',
] as const;

export interface ProjectAvatarProps {
  /** 显示文本来源（取首二字，原型 txt.slice(0,2)） */
  label: string;
  /** 色轮序号（行序 i % 6，原型 AVC[i%AVC.length]） */
  index: number;
  /** 直径 px（原型默认 38；列表卡 42） */
  size?: number;
}

export default function ProjectAvatar({
  label,
  index,
  size = 38,
}: ProjectAvatarProps) {
  return (
    <span
      className="grid shrink-0 select-none place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        background: AVATAR_WHEEL[index % AVATAR_WHEEL.length],
      }}
      aria-hidden="true"
    >
      {label.slice(0, 2)}
    </span>
  );
}
