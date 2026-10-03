import { useLayoutEffect, useRef, useState } from 'react';

interface GameCardTagRowProps {
  children: React.ReactNode;
  className?: string;
}

/** Room kept at the row's end for the "+N" chip once anything overflows. */
const MORE_CHIP_RESERVE_PX = 34;

/**
 * One row of tags, never two and never clipped mid-pill: pills that do not fit
 * are hidden and counted into a trailing "+N". The full set is always on the
 * game page one tap away. Direction-aware, so RTL locales drop from the left.
 */
export function GameCardTagRow({ children, className = '' }: GameCardTagRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const fit = () => {
      const pills = Array.from(row.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el !== moreRef.current,
      );
      const more = moreRef.current;
      // Measure without the chip, or a visible "+N" could count itself as overflow.
      if (more) more.style.display = 'none';
      pills.forEach((pill) => {
        pill.style.display = '';
      });
      const fits = row.scrollWidth <= row.clientWidth + 1;
      if (more) more.style.display = '';
      if (fits) {
        setHiddenCount(0);
        return;
      }
      const rtl = getComputedStyle(row).direction === 'rtl';
      const box = row.getBoundingClientRect();
      const limit = rtl ? box.left + MORE_CHIP_RESERVE_PX : box.right - MORE_CHIP_RESERVE_PX;
      let hidden = 0;
      let overflowing = false;
      for (const pill of pills) {
        const rect = pill.getBoundingClientRect();
        // Keep at least the first pill: it is the most important one.
        if (!overflowing && pill !== pills[0]) {
          overflowing = rtl ? rect.left < limit : rect.right > limit;
        }
        if (overflowing) {
          pill.style.display = 'none';
          hidden += 1;
        }
      }
      setHiddenCount(hidden);
    };

    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(row);
    return () => observer.disconnect();
  });

  return (
    <div ref={rowRef} className={`flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden ${className}`}>
      {children}
      <span
        ref={moreRef}
        className={`shrink-0 items-center rounded-full bg-gray-900/[0.05] px-2 py-0.5 text-xs font-medium tabular-nums text-gray-500 dark:bg-white/[0.07] dark:text-gray-400 ${
          hiddenCount > 0 ? 'inline-flex' : 'hidden'
        }`}
        aria-hidden
      >
        +{hiddenCount}
      </span>
    </div>
  );
}
