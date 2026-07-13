import { useEffect, useState, type RefObject } from 'react';

export type SectionRefMap = Record<string, RefObject<HTMLDivElement | null>>;

function sectionsEqual(
  prev: Record<string, boolean>,
  next: Record<string, boolean>,
): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(prev).length) return false;
  return keys.every((key) => prev[key] === next[key]);
}

/**
 * Tracks which sections have scrolled above the top edge of the scroll
 * container. By default, a chip appears once the section top reaches the top
 * (revealFraction 0). Uses hysteresis so chips do not flicker when a section
 * sits on the threshold. Measured on scroll/resize/content-resize, throttled
 * to one measurement per animation frame.
 */
export function useScrolledPastSections(
  containerRef: RefObject<HTMLElement | null>,
  sectionRefs: SectionRefMap,
  topOffset = 12,
  revealFraction = 0,
  hysteresis = 40,
): Record<string, boolean> {
  const [past, setPast] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;

    const measure = () => {
      raf = 0;
      const containerTop = container.getBoundingClientRect().top;
      const showLine = containerTop + topOffset;
      const hideLine = containerTop + topOffset + hysteresis;

      setPast((prev) => {
        const next: Record<string, boolean> = {};
        for (const [key, ref] of Object.entries(sectionRefs)) {
          const el = ref.current;
          if (!el || !el.isConnected) {
            next[key] = prev[key] ?? false;
            continue;
          }
          const rect = el.getBoundingClientRect();
          const revealY = rect.top + rect.height * revealFraction;
          const wasPast = prev[key] ?? false;
          next[key] = wasPast ? revealY < hideLine : revealY < showLine;
        }
        return sectionsEqual(prev, next) ? prev : next;
      });
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const content = container.firstElementChild;
    const resizeObserver = content ? new ResizeObserver(schedule) : null;
    if (content && resizeObserver) resizeObserver.observe(content);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver?.disconnect();
    };
  }, [containerRef, sectionRefs, topOffset, revealFraction, hysteresis]);

  return past;
}
