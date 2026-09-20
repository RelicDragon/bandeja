/**
 * PRD 346 — the "Shows up" tile.
 *
 * One sky tone at every value. There is deliberately **no** red/amber grading
 * and no threshold colouring: a lower number is not a worse person, and the
 * tile is hidden entirely until there are at least `minSample` recorded games
 * so a single missed game can never read as a verdict.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';
import { StatTile } from '@/components/ui/StatTile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  formatPercent,
  ringDashOffset,
  shouldShowAttendanceRate,
  SHOWS_UP_RING_CIRCUMFERENCE,
} from './attendanceVisuals';

export interface ShowsUpTileProps {
  summary: { rate: number | null; sampleSize: number; minSample: number } | null | undefined;
  className?: string;
}

export function ShowsUpTile({ summary, className }: ShowsUpTileProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const visible = shouldShowAttendanceRate(summary);
  const rate = visible ? summary.rate : 0;
  const percentText = useMemo(
    () => formatPercent(rate, i18n.resolvedLanguage || i18n.language || 'en'),
    [rate, i18n.resolvedLanguage, i18n.language],
  );

  if (!visible) return null;

  return (
    <StatTile
      className={className}
      tone="primary"
      icon={CalendarCheck}
      label={t('attendance.stat.label')}
      hint={t('attendance.stat.tooltip')}
      value={
        <span className="inline-flex items-center gap-2">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            aria-hidden
            className="shrink-0 -rotate-90"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              strokeWidth="4"
              className="stroke-gray-200 dark:stroke-gray-700"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-primary-500 dark:stroke-primary-400"
              strokeDasharray={SHOWS_UP_RING_CIRCUMFERENCE}
              strokeDashoffset={ringDashOffset(rate)}
              style={
                reduceMotion
                  ? undefined
                  : { transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }
              }
            />
          </svg>
          <span className="tabular-nums">{percentText}</span>
          <span className="sr-only">{t('attendance.stat.gaugeLabel', { rate })}</span>
        </span>
      }
    />
  );
}
