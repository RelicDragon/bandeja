import { useEffect, useState, type RefObject } from 'react';

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
      setShowLeftFade(scrollLeft > 0);
      setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
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
