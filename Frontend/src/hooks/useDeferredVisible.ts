import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

type UseDeferredVisibleOptions = {
  rootMargin?: string;
  /** When true, also require the document to have been scrolled before intersecting counts. */
  requireScrollBeforeVisible?: boolean;
};

/**
 * Becomes true when the target element intersects the viewport.
 */
export function useDeferredVisible(
  targetRef: RefObject<Element | null>,
  options?: UseDeferredVisibleOptions,
): boolean {
  const [visible, setVisible] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const rootMargin = options?.rootMargin ?? '120px 0px';
  const requireScroll = options?.requireScrollBeforeVisible === true;

  useEffect(() => {
    if (!requireScroll || hasScrolled) return;
    const onScroll = () => setHasScrolled(true);
    window.addEventListener('scroll', onScroll, { passive: true, once: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [requireScroll, hasScrolled]);

  useEffect(() => {
    if (visible) return;
    if (requireScroll && !hasScrolled) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let retryFrame = 0;

    const markVisible = () => {
      if (!cancelled) setVisible(true);
    };

    const attach = () => {
      const node = targetRef.current;
      if (!node || cancelled) return;
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            markVisible();
          }
        },
        { rootMargin },
      );
      observer.observe(node);
    };

    attach();
    if (!targetRef.current) {
      retryFrame = requestAnimationFrame(attach);
    }

    return () => {
      cancelled = true;
      if (retryFrame) cancelAnimationFrame(retryFrame);
      observer?.disconnect();
    };
  }, [visible, targetRef, rootMargin, requireScroll, hasScrolled]);

  return visible;
}
