'use client';
import { chakra } from '@chakra-ui/system';
import { ComponentProps } from 'react';
import { Image } from './Image';

type AvatarImageProps = Partial<
  ComponentProps<typeof Image> & {
    showBorder?: boolean;
  }
>;

export function NextAvatar({
  src,
  showBorder,
  alt = '',
  style,
  className,
  ...props
}: AvatarImageProps) {
  // P2-CLEANUP F003 fix-1：深浅色跟随交给 Tailwind `dark:` 变体，不经任何 JS 状态。
  //
  // 状态源仍是 body.dark（spec D2）—— darkMode:'class' 下 `dark:` 编译为 `:is(.dark *)`，
  // 由 CSS 直接选中，切换即时生效，且这是本项目的主导范式（84 个文件用 dark: 变体）。
  //
  // 为何不读 hooks/useColorMode（F003 首版曾按 acceptance 字面那样做，被验收判 PARTIAL）：
  // 该 hook 每个调用点各持一份独立 useState + 空依赖 useEffect，无任何跨实例订阅原语。
  // 持有 toggle 的 navbar 自翻自更新所以正常，而 Avatar 是纯读取方 —— 只在挂载那一刻同步一次，
  // 活体切换（navbar 切深色）永远收不到通知，边框不跟随。用 CSS 变体则完全绕开这个遗留缺陷。
  //
  // 边框走 className（Tailwind 静态类名，CSS 域——web-runtime-patterns §5）。
  // 此前写成 border/borderColor 样式 props 交给 ./Image，但 Image 是纯 <div> 包装而非 Chakra
  // 组件，这类 props 被 spread 成无效 DOM 属性、不产出任何样式（F003 审计发现 2）。
  const borderClass = showBorder
    ? 'border-2 border-white dark:border-navy-700'
    : '';

  return (
    <Image
      width="2"
      height="20"
      {...props}
      className={[borderClass, className].filter(Boolean).join(' ')}
      alt={alt}
      objectFit={'fill'}
      src={src}
      style={{ ...style, borderRadius: '50%' }}
    />
  );
}

export const ChakraNextAvatar = chakra(NextAvatar, {
  shouldForwardProp: (prop) =>
    ['width', 'height', 'src', 'alt', 'layout'].includes(prop),
});
