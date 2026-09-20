import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** House rule: number changes count up in 600 ms or less (CONTRACT §7.1). */
export const COUNT_UP_MAX_DURATION_MS = 600;

export interface CountUpNumberProps {
  value: number;
  /** Defaults to 600 ms and is clamped to it. */
  durationMs?: number;
  decimals?: number;
  /** Defaults to `Intl.NumberFormat` for the active i18next locale. */
  format?: (n: number) => string;
  className?: string;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * Animated count-up. Reduced motion jumps straight to `value`; a `value` change
 * mid-flight re-targets from whatever is on screen instead of restarting from
 * zero, and the pending frame is always cancelled on unmount.
 */
export const CountUpNumber = ({
  value,
  durationMs = COUNT_UP_MAX_DURATION_MS,
  decimals = 0,
  format,
  className = '',
}: CountUpNumberProps) => {
  const { i18n } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState(value);
  const displayedRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    cancel();

    const from = displayedRef.current;
    const duration = Math.min(Math.max(durationMs, 0), COUNT_UP_MAX_DURATION_MS);
    const settle = () => {
      displayedRef.current = value;
      setDisplayed(value);
    };

    if (prefersReducedMotion || duration === 0 || from === value) {
      settle();
      return cancel;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      if (progress >= 1) {
        frameRef.current = null;
        settle();
        return;
      }
      const next = from + (value - from) * easeOutCubic(progress);
      displayedRef.current = next;
      setDisplayed(next);
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return cancel;
  }, [value, durationMs, prefersReducedMotion]);

  const formatValue = useMemo(() => {
    if (format) return format;
    const numberFormat = new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return (n: number) => numberFormat.format(n);
  }, [format, decimals, i18n.language]);

  return <span className={`tabular-nums ${className}`.trim()}>{formatValue(displayed)}</span>;
};
