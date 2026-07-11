import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, type ResolvedDisplaySettings } from '@/utils/displayPreferences';

type ReservationSelectionProgressProps = {
  selectedCount: number;
  selectionLimits: BookingSelectionLimits;
  derivedStartTime: string | null;
  derivedEndTime: string | null;
  atMax: boolean;
};

function formatTime(iso: string, displaySettings: ResolvedDisplaySettings): string {
  return new Intl.DateTimeFormat(displaySettings.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: displaySettings.hour12,
  }).format(parseISO(iso));
}

function formatDate(iso: string, displaySettings: ResolvedDisplaySettings): string {
  return new Intl.DateTimeFormat(displaySettings.locale, {
    month: 'short',
    day: 'numeric',
  }).format(parseISO(iso));
}

function formatWindowLabel(
  startTime: string,
  endTime: string,
  displaySettings: ResolvedDisplaySettings,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const crossDate =
    format(parseISO(startTime), 'yyyy-MM-dd') !== format(parseISO(endTime), 'yyyy-MM-dd');
  if (crossDate) {
    return t('createGame.locationTime.summaryCrossDate', {
      startDate: formatDate(startTime, displaySettings),
      start: formatTime(startTime, displaySettings),
      endDate: formatDate(endTime, displaySettings),
      end: formatTime(endTime, displaySettings),
    });
  }
  return t('createGame.locationTime.summaryWindow', {
    start: formatTime(startTime, displaySettings),
    end: formatTime(endTime, displaySettings),
  });
}

export function ReservationSelectionProgress({
  selectedCount,
  selectionLimits,
  derivedStartTime,
  derivedEndTime,
  atMax,
}: ReservationSelectionProgressProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const { min, max } = selectionLimits;
  const complete = selectedCount >= min;
  const progress = max > 0 ? Math.min(selectedCount / max, 1) : 0;
  const playersLabel = selectionLimits.playersPerCourt === 2 ? '1v1' : '2v2';

  const windowLabel =
    derivedStartTime && derivedEndTime
      ? formatWindowLabel(derivedStartTime, derivedEndTime, displaySettings, t)
      : null;

  if (complete) {
    return (
      <div className="space-y-2" aria-live="polite">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-950/30"
        >
          <Check
            size={16}
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              {t(
                selectedCount === 1
                  ? 'createGame.locationTime.selectionCompleteOne'
                  : 'createGame.locationTime.selectionCompleteMany',
                { count: selectedCount },
              )}
            </p>
            {windowLabel ? (
              <p className="mt-0.5 text-xs text-emerald-800/90 dark:text-emerald-200/90">{windowLabel}</p>
            ) : null}
          </div>
        </motion.div>
        {atMax ? (
          <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            {t('createGame.locationTime.selectionAtMax', { players: playersLabel })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {t('createGame.locationTime.selectionProgress', {
            selected: selectedCount,
            max,
            players: playersLabel,
          })}
        </span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {selectedCount}/{max}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={selectedCount}
      >
        <motion.div
          className="h-full rounded-full bg-primary-500 dark:bg-primary-400"
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        />
      </div>
      {atMax ? (
        <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {t('createGame.locationTime.selectionAtMax', { players: playersLabel })}
        </p>
      ) : null}
    </div>
  );
}
