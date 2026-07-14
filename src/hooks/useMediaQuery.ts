'use client';
import { useEffect, useState } from 'react';

/**
 * 响应式媒体查询 hook（DS-FOUNDATION F005）。
 * 例：`const isDesktop = useMediaQuery('(min-width: 1200px)')`（对齐 tailwind xl 断点）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
