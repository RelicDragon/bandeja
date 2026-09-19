import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';

import { CHAT_VIRTUAL_ROW_POSITION_TRANSITION } from './chatListMotion';

const POSITION_TRANSITION = CHAT_VIRTUAL_ROW_POSITION_TRANSITION;
const SCROLL_SETTLE_MS = 120;
/**
 * Scroll suppression rides a CSS variable on the scroll container rather than a
 * ref read during render, so the returned styles are a pure function of `rows`.
 */
const SCROLL_SUPPRESS_VAR = '--chat-row-position-transition';
const ROW_TRANSITION = `var(${SCROLL_SUPPRESS_VAR}, ${POSITION_TRANSITION})`;

export type VirtualRowStyle = { transform: string; transition?: string };

type CachedRowStyle = {
  start: number;
  transition: string | undefined;
  style: VirtualRowStyle;
};

export function useVirtualRowLayoutTransition(
  scrollElementRef: RefObject<HTMLDivElement | null>,
  rows: VirtualItem[],
  enabled: boolean,
  subscribeScroll?: (listener: () => void) => () => void
): Map<string, VirtualRowStyle> {
  const prevStartByKeyRef = useRef(new Map<string, number>());
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Persists across renders so an unmoved row reuses its transform string and style object
  // instead of allocating both on every scroll-driven render.
  const styleCacheRef = useRef(new Map<string, CachedRowStyle>());

  useEffect(() => {
    if (!enabled) return;

    const suppress = (on: boolean) => {
      const el = scrollElementRef.current;
      if (!el) return;
      if (on) el.style.setProperty(SCROLL_SUPPRESS_VAR, 'none');
      else el.style.removeProperty(SCROLL_SUPPRESS_VAR);
    };

    const onScroll = () => {
      suppress(true);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => suppress(false), SCROLL_SETTLE_MS);
    };

    const stop = () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      suppress(false);
    };

    if (subscribeScroll) {
      const unsubscribe = subscribeScroll(onScroll);
      return () => {
        unsubscribe();
        stop();
      };
    }

    const el = scrollElementRef.current;
    if (!el) return;

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      stop();
    };
  }, [scrollElementRef, enabled, subscribeScroll]);

  const prev = prevStartByKeyRef.current;
  const cache = styleCacheRef.current;
  const styles = new Map<string, VirtualRowStyle>();

  for (const row of rows) {
    const key = String(row.key);
    const prevStart = prev.get(key);
    const moved = prevStart !== undefined && prevStart !== row.start;
    const transition = enabled && moved ? ROW_TRANSITION : undefined;

    const cached = cache.get(key);
    if (cached && cached.start === row.start && cached.transition === transition) {
      styles.set(key, cached.style);
      continue;
    }
    const style: VirtualRowStyle = { transform: `translateY(${row.start}px)`, transition };
    cache.set(key, { start: row.start, transition, style });
    styles.set(key, style);
  }

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const row of rows) next.set(String(row.key), row.start);
    prevStartByKeyRef.current = next;

    // Drop cache entries for rows that have scrolled out of the rendered window.
    const live = styleCacheRef.current;
    if (live.size > next.size * 3) {
      for (const key of live.keys()) {
        if (!next.has(key)) live.delete(key);
      }
    }
  }, [rows]);

  return styles;
}
