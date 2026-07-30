import { useEffect, useState, type RefObject } from 'react';

/** Absorbs sub-pixel rounding and scroll-snap settling near either edge. */
const EDGE_TOLERANCE_PX = 2;

export function useHorizontalScrollFade(
  containerRef: RefObject<HTMLElement | null>,
  itemCount: number
) {
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkScrollPosition = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      setShowLeftFade(scrollLeft > EDGE_TOLERANCE_PX);
      setShowRightFade(maxScrollLeft - scrollLeft > EDGE_TOLERANCE_PX);
    };

    checkScrollPosition();
    container.addEventListener('scroll', checkScrollPosition);
    const resizeObserver = new ResizeObserver(checkScrollPosition);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
      resizeObserver.disconnect();
    };
  }, [containerRef, itemCount]);

  return { showLeftFade, showRightFade };
}
