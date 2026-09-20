import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { formatRelativeTimeSafe } from '@/utils/dateFormat';
import {
  SPOT_OPENED_PULSE_CYCLES,
  SPOT_OPENED_PULSE_CYCLE_MS,
} from './spotOpenedWindow';

export interface SpotOpenedPillProps {
  /** ISO timestamp of the seat-opened event. */
  openedAt: string;
  className?: string;
}

const PILL =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
  'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';

/**
 * PRD 347 — the "Spot opened" pill.
 *
 * The dot pulses for exactly two 1.2 s cycles and then holds still, so a list
 * of cards settles instead of twitching forever. Under reduced motion it is
 * static from the first frame. The dot is decorative; the accessible name
 * carries the relative time ("A spot opened 2 minutes ago").
 */
export function SpotOpenedPill({ openedAt, className }: SpotOpenedPillProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [pulsing, setPulsing] = useState(!reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      setPulsing(false);
      return;
    }
    setPulsing(true);
    const timer = window.setTimeout(
      () => setPulsing(false),
      SPOT_OPENED_PULSE_CYCLE_MS * SPOT_OPENED_PULSE_CYCLES,
    );
    return () => window.clearTimeout(timer);
  }, [openedAt, reduceMotion]);

  const relative = formatRelativeTimeSafe(openedAt);

  return (
    <span
      className={`${PILL} ${className ?? ''}`.trim()}
      // `role="img"` (the pattern `WeatherRiskPill` uses), not `role="status"`.
      // A live region on every card turns a scroll down a busy Find list into a
      // stream of "A spot opened 4 minutes ago" announcements out of context;
      // the accessible name is identical either way.
      role="img"
      aria-label={t('spots.pill.ariaLabel', { time: relative })}
      data-testid="spot-opened-pill"
      data-pulsing={pulsing ? 'true' : 'false'}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400 ${
          pulsing ? 'animate-spot-pulse' : ''
        }`}
      />
      <span>{t('spots.pill.label')}</span>
    </span>
  );
}
