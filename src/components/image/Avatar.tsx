'use client';
import { chakra } from '@chakra-ui/system';
import { ComponentProps } from 'react';
import useColorMode from 'hooks/useColorMode';
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
  // P2-CLEANUP F003：状态源统一到 body.dark（spec D2）。此前读 @chakra-ui/system 自带的
  // useColorMode —— 项目无 ChakraProvider，那个 colorMode 是孤儿状态，与 body.dark 互不相通。
  const { isDark } = useColorMode();

  // 边框走 className（Tailwind 静态类名，CSS 域——web-runtime-patterns §5）。
  // 此前写成 border/borderColor 样式 props 交给 ./Image，但 Image 是纯 <div> 包装而非 Chakra
  // 组件，这类 props 被 spread 成无效 DOM 属性、不产出任何样式（F003 审计发现 2）。
  const borderClass = showBorder
    ? `border-2 ${isDark ? 'border-navy-700' : 'border-white'}`
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
