import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';

import { CHAT_VIRTUAL_ROW_POSITION_TRANSITION } from './chatListMotion';

const POSITION_TRANSITION = CHAT_VIRTUAL_ROW_POSITION_TRANSITION;
const SCROLL_SETTLE_MS = 120;

export function useVirtualRowLayoutTransition(
  scrollElementRef: RefObject<HTMLDivElement | null>,
  rows: VirtualItem[],
  enabled: boolean
): Map<string, { transform: string; transition?: string }> {
  const prevStartByKeyRef = useRef(new Map<string, number>());
  const scrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollElementRef.current;
    if (!el) return;

    const onScroll = () => {
      scrollingRef.current = true;
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        scrollingRef.current = false;
      }, SCROLL_SETTLE_MS);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    };
  }, [scrollElementRef, enabled]);

  const prev = prevStartByKeyRef.current;
  const scrolling = scrollingRef.current;
  const styles = new Map<string, { transform: string; transition?: string }>();

  for (const row of rows) {
    const key = String(row.key);
    const prevStart = prev.get(key);
    const moved = prevStart !== undefined && prevStart !== row.start;
    styles.set(key, {
      transform: `translateY(${row.start}px)`,
      transition: enabled && moved && !scrolling ? POSITION_TRANSITION : undefined,
    });
  }

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const row of rows) next.set(String(row.key), row.start);
    prevStartByKeyRef.current = next;
  }, [rows]);

  return styles;
}
