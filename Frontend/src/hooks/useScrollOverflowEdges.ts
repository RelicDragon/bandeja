import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

const DEFAULT_EDGE_THRESHOLD = 32;

type UseScrollOverflowEdgesOptions = {
  scrollRef?: RefObject<HTMLElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
  edgeThreshold?: number;
  enabled?: boolean;
};

export type ScrollOverflowEdges = {
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
};

function readScrollEdges(
  scrollEl: HTMLElement | null,
  edgeThreshold: number,
): ScrollOverflowEdges {
  const scrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY;
  const scrollHeight = scrollEl ? scrollEl.scrollHeight : document.documentElement.scrollHeight;
  const clientHeight = scrollEl ? scrollEl.clientHeight : window.innerHeight;
  const overflow = scrollHeight > clientHeight + 1;
  const distanceFromEnd = scrollHeight - scrollTop - clientHeight;
  const atTop = scrollTop <= edgeThreshold;
  const atBottom = distanceFromEnd <= edgeThreshold;
  return {
    hasMoreAbove: overflow && !atTop,
    hasMoreBelow: overflow && !atBottom,
  };
}

export function useScrollOverflowEdges({
  scrollRef,
  contentRef,
  edgeThreshold = DEFAULT_EDGE_THRESHOLD,
  enabled = true,
}: UseScrollOverflowEdgesOptions): ScrollOverflowEdges {
  const [edges, setEdges] = useState<ScrollOverflowEdges>({
    hasMoreAbove: false,
    hasMoreBelow: false,
  });

  const update = useCallback(() => {
    if (!enabled) {
      setEdges((prev) =>
        prev.hasMoreAbove || prev.hasMoreBelow
          ? { hasMoreAbove: false, hasMoreBelow: false }
          : prev,
      );
      return;
    }
    const scrollEl = scrollRef?.current ?? null;
    const next = readScrollEdges(scrollEl, edgeThreshold);
    setEdges((prev) =>
      prev.hasMoreAbove === next.hasMoreAbove && prev.hasMoreBelow === next.hasMoreBelow ? prev : next,
    );
  }, [scrollRef, edgeThreshold, enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      setEdges({ hasMoreAbove: false, hasMoreBelow: false });
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

  return edges;
}
