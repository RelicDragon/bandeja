import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

const DEFAULT_BOTTOM_THRESHOLD = 32;

type UseHasMoreContentBelowOptions = {
  scrollRef?: RefObject<HTMLElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
  bottomThreshold?: number;
  enabled?: boolean;
};

function readScrollMetrics(scrollEl: HTMLElement | null, bottomThreshold: number) {
  const scrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY;
  const scrollHeight = scrollEl ? scrollEl.scrollHeight : document.documentElement.scrollHeight;
  const clientHeight = scrollEl ? scrollEl.clientHeight : window.innerHeight;
  const overflow = scrollHeight > clientHeight + 1;
  const distanceFromEnd = scrollHeight - scrollTop - clientHeight;
  const atBottom = distanceFromEnd <= bottomThreshold;
  return overflow && !atBottom;
}

export function useHasMoreContentBelow({
  scrollRef,
  contentRef,
  bottomThreshold = DEFAULT_BOTTOM_THRESHOLD,
  enabled = true,
}: UseHasMoreContentBelowOptions): boolean {
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const update = useCallback(() => {
    if (!enabled) {
      setHasMoreBelow(false);
      return;
    }
    const scrollEl = scrollRef?.current ?? null;
    setHasMoreBelow(readScrollMetrics(scrollEl, bottomThreshold));
  }, [scrollRef, bottomThreshold, enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      setHasMoreBelow(false);
      return;
    }
    update();
    let alive = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (alive) update();
      });
    });
    return () => {
      alive = false;
    };
  }, [enabled, update]);

  useEffect(() => {
    if (!enabled) return;

    const scrollEl = scrollRef?.current ?? null;
    const scrollTarget: HTMLElement | Window = scrollEl ?? window;

    const onScroll = () => update();
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const ro = new ResizeObserver(() => update());
    if (scrollEl) ro.observe(scrollEl);
    const contentEl = contentRef?.current;
    if (contentEl) ro.observe(contentEl);
    if (!scrollEl) {
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }

    update();

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
    };
  }, [scrollRef, contentRef, enabled, update]);

  return hasMoreBelow;
}
