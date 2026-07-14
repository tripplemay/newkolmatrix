'use client';
import { useEffect, useState } from 'react';

/**
 * 防抖 hook（DS-FOUNDATION F005）。
 * 用于搜索输入、过滤器等高频变化值（如 navbar / Discovery 搜索框）。
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
