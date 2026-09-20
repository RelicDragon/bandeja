/**
 * PRD 346 — "2 of 4 confirmed" + Nudge, for the organizer.
 *
 * There are no settings, no deadline and no release option here on purpose.
 * The only thing an organizer can do is ask, once every six hours.
 */
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { BellRing } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { confirmedPercent } from './attendanceVisuals';

export interface AttendanceOrganizerStripProps {
  confirmedCount: number;
  playingCount: number;
  nudgeAllowed: boolean;
  nudgeRemainingHours: number;
  isNudging: boolean;
  onNudge: () => void;
}

export function AttendanceOrganizerStrip({
  confirmedCount,
  playingCount,
  nudgeAllowed,
  nudgeRemainingHours,
  isNudging,
  onNudge,
}: AttendanceOrganizerStripProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const percent = confirmedPercent(confirmedCount, playingCount);
  const progressLabel = t('attendance.organizer.progress', {
    confirmed: confirmedCount,
    total: playingCount,
  });

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="relative h-7 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={playingCount}
            aria-valuenow={confirmedCount}
            aria-label={progressLabel}
          >
            <motion.div
              className="absolute inset-y-0 start-0 rounded-full bg-green-500/25 dark:bg-green-400/25"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 260, damping: 24, duration: 0.3 }
              }
              aria-hidden
            />
            <span className="relative flex h-full items-center px-3 text-xs font-medium text-gray-700 dark:text-gray-200">
              {progressLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onNudge}
          disabled={!nudgeAllowed || isNudging}
          className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:opacity-50 dark:text-primary-400 dark:hover:bg-primary-950/40"
        >
          <BellRing size={16} aria-hidden />
          {t('attendance.organizer.nudge')}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        {nudgeAllowed
          ? t('attendance.organizer.legendCaption')
          : t('attendance.organizer.nudgeCooldown', { hours: Math.max(1, nudgeRemainingHours) })}
      </p>
    </div>
  );
}
