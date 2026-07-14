'use client';
import React from 'react';

// DS-FOUNDATION F004：KOLMatrix 统一按钮组件。
// 遵循 Horizon 视觉语言（rounded-xl / brand 紫 / 渐变 CTA / 过渡）。模板原本用内联 class 串手写按钮，此处收敛为可复用组件。

export type ButtonVariant =
  | 'primary'
  | 'solid'
  | 'secondary'
  | 'ghost'
  | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md shadow-brand-500/20 hover:shadow-lg active:opacity-90',
  solid:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200 dark:text-navy-900',
  secondary:
    'bg-lightPrimary text-navy-700 hover:bg-gray-100 active:bg-gray-200 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600',
  ghost:
    'bg-transparent text-brand-500 hover:bg-brand-50 active:bg-brand-100 dark:text-white dark:hover:bg-white/10',
  danger:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 dark:bg-red-400 dark:hover:bg-red-300 dark:text-navy-900',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`linear inline-flex items-center justify-center rounded-xl font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-900 ${
        SIZE_CLASSES[size]
      } ${VARIANT_CLASSES[variant]} ${fullWidth ? 'w-full' : ''} ${
        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
