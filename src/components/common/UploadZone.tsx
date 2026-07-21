'use client';
// ARCH-M05 F005 — 上传拖放区：react-dropzone 封装。对照原型 `.dropzone`
// （1.5px 虚线框 · upload 图标 · 主/副文案两行 · hover 转 brand，V11 游戏知识素材库）。
// 职责边界：仅负责收取文件并回调 onFiles；解析状态（analyzing/done 行）由消费方渲染
// （ui-inventory V11：上传→插 analyzing 行→转 done 由 mock 契约层模拟）。

import React from 'react';
import { useDropzone } from 'react-dropzone';
import type { Accept } from 'react-dropzone';
import { MdOutlineFileUpload } from 'react-icons/md';

export interface UploadZoneProps {
  /** 收到文件（拖拽或点击选择）后的回调 */
  onFiles: (files: File[]) => void;
  /** 主文案插槽（默认「上传素材」） */
  title?: React.ReactNode;
  /** 副文案插槽（默认「拖拽或点击上传」；V11 传素材类型说明） */
  hint?: React.ReactNode;
  /** 透传 react-dropzone 的 MIME 约束 */
  accept?: Accept;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function UploadZone({
  onFiles,
  title = '上传素材',
  hint = '拖拽或点击上传',
  accept,
  multiple = true,
  disabled = false,
  className,
}: UploadZoneProps) {
  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) onFiles(acceptedFiles);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
    disabled,
  });

  return (
    <div
      {...getRootProps({
        'aria-label': '上传素材',
        className: `flex w-full flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-dashed p-[22px] text-gray-700 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-gray-400 ${
          isDragActive
            ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-400/10'
            : 'border-gray-200 bg-lightPrimary hover:border-brand-500 hover:text-brand-500 dark:border-white/20 dark:bg-navy-700'
        }${disabled ? ' cursor-not-allowed opacity-50' : ' cursor-pointer'}${
          className ? ` ${className}` : ''
        }`,
      })}
    >
      <input {...getInputProps()} />
      <MdOutlineFileUpload
        className="h-6 w-6 text-brand-500 dark:text-brand-400"
        aria-hidden
      />
      <b className="text-compact font-bold text-navy-700 dark:text-white">
        {title}
      </b>
      <span className="text-micro">{hint}</span>
    </div>
  );
}
