import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';

import { CHAT_VIRTUAL_ROW_POSITION_TRANSITION } from './chatListMotion';

const POSITION_TRANSITION = CHAT_VIRTUAL_ROW_POSITION_TRANSITION;
const SCROLL_SETTLE_MS = 120;

export function useVirtualRowLayoutTransition(
  scrollElementRef: RefObject<HTMLDivElement | null>,
  rows: VirtualItem[],
  enabled: boolean
): Map<string | number, { transform: string; transition?: string }> {
  const prevStartByKeyRef = useRef(new Map<string | number, number>());
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
  const styles = new Map<string | number, { transform: string; transition?: string }>();

  for (const row of rows) {
    const prevStart = prev.get(row.key);
    const moved = prevStart !== undefined && prevStart !== row.start;
    styles.set(row.key, {
      transform: `translateY(${row.start}px)`,
      transition: enabled && moved && !scrolling ? POSITION_TRANSITION : undefined,
    });
  }

  useLayoutEffect(() => {
    const next = new Map<string | number, number>();
    for (const row of rows) next.set(row.key, row.start);
    prevStartByKeyRef.current = next;
  }, [rows]);

  return styles;
}
