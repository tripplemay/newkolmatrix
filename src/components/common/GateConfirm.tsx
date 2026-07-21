'use client';
// ARCH-M05 F005 — 闸门确认卡（S4，🚪 outbound 4 类共用：发送/报价/放款/分享）。
// 8 元素对照原型 `.scrim/.modal`（L463-467）：①scrim 遮罩+blur ②红底 shield 46px
// ③标题 ④正文（点名收件人/收款方）⑤🔒 harm 利害清单表（行数随动作 2/3/3/2）
// ⑥🔒 irrev 红标行（4 类文案不同）⑦取消 ghost ⑧确认红色 gate 钮。
// Chakra Modal（白名单原语）：Esc + 遮罩关闭、焦点陷阱为 Modal 自带；useDisclosure 归消费方。
// 纯呈现组件：pending→confirm 闸门链路接线归消费 feature（spec D6，M0.5 只做触发与确认卡 UI）。

import React from 'react';
import { Modal, ModalBody, ModalContent, ModalOverlay } from '@chakra-ui/modal';
import { MdErrorOutline, MdOutlineShield } from 'react-icons/md';
import Button from './Button';

/** 🔒 harm 利害清单行（如 收件人/金额/数据范围…），行数随动作与 scope 不同（裁决 #3） */
export interface GateHarmRow {
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface GateConfirmProps {
  isOpen: boolean;
  /** 取消 / Esc / 遮罩点击 */
  onClose: () => void;
  /** 红色 gate 钮确认 */
  onConfirm: () => void;
  /** 标题（确认发送对外邮件 / 确认价格承诺 / 确认放款 / 确认对外分享） */
  title: React.ReactNode;
  /** 🔒 利害清单行数据 */
  harmRows: GateHarmRow[];
  /** 🔒 不可逆红标行文案（如「对外 · 发出后不可撤销」，4 类各不同） */
  irrevText: React.ReactNode;
  /** 确认钮文案（确认发送 / 确认报价 / 确认放款 / 生成链接） */
  confirmText: React.ReactNode;
  cancelText?: React.ReactNode;
  /** 确认动作进行中（消费方接闸门链路时用） */
  confirmLoading?: boolean;
  /** 正文插槽：点名收件人 / 收款方 */
  children?: React.ReactNode;
}

export default function GateConfirm({
  isOpen,
  onClose,
  onConfirm,
  title,
  harmRows,
  irrevText,
  confirmText,
  cancelText = '取消',
  confirmLoading = false,
  children,
}: GateConfirmProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      {/* ① scrim：navy 半透明 + blur（原型 rgba(11,20,55,.5) + blur(4px)） */}
      <ModalOverlay className="!bg-navy-900/50 backdrop-blur-sm" />
      <ModalContent className="!m-auto !w-[min(480px,calc(100vw-48px))] !max-w-[480px] overflow-hidden !rounded-[20px] !bg-white !shadow-2xl dark:!bg-navy-800">
        {/* ②③ 红底 shield 46px + 标题 */}
        <div className="flex items-center gap-3 px-6 pb-4 pt-[22px]">
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
            <MdOutlineShield className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">
            {title}
          </h3>
        </div>
        <ModalBody className="!px-6 !py-0">
          {/* ④ 正文插槽 */}
          {children != null && (
            <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-400">
              {children}
            </div>
          )}
          {/* ⑤ 🔒 harm 利害清单表 */}
          <div className="my-3.5 overflow-hidden rounded-[14px] bg-lightPrimary dark:bg-navy-700">
            {harmRows.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-compact last:border-b-0 dark:border-white/10"
              >
                <span className="shrink-0 text-gray-700 dark:text-gray-400">
                  {row.label}
                </span>
                <b className="text-right font-bold text-navy-700 dark:text-white">
                  {row.value}
                </b>
              </div>
            ))}
          </div>
          {/* ⑥ 🔒 irrev 红标行 */}
          <span className="inline-flex items-center gap-1 text-micro font-bold text-red-500 dark:text-red-400">
            <MdErrorOutline className="h-4 w-4 shrink-0" aria-hidden />
            {irrevText}
          </span>
        </ModalBody>
        {/* ⑦⑧ 取消 ghost（原型 .btn.ghost = lightPrimary 底，对应 Button secondary）+ 确认红色 gate */}
        <div className="flex justify-end gap-2.5 px-6 pb-[22px] pt-[18px]">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant="danger" loading={confirmLoading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
