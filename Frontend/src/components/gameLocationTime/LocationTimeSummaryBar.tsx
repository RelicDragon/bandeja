import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { parseISO, format } from 'date-fns';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';

type LocationTimeSummaryBarProps = {
  bookingCount: number;
  startTime: string | null;
  endTime: string | null;
  displaySettings: ResolvedDisplaySettings;
  visible: boolean;
};

function formatTime(iso: string, displaySettings: ResolvedDisplaySettings): string {
  const date = parseISO(iso);
  return new Intl.DateTimeFormat(displaySettings.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: displaySettings.hour12,
  }).format(date);
}

function formatDate(iso: string, displaySettings: ResolvedDisplaySettings): string {
  const date = parseISO(iso);
  return new Intl.DateTimeFormat(displaySettings.locale, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function LocationTimeSummaryBar({
  bookingCount,
  startTime,
  endTime,
  displaySettings,
  visible,
}: LocationTimeSummaryBarProps) {
  const { t } = useTranslation();

  if (!visible || !startTime || !endTime || bookingCount === 0) return null;

  const crossDate = format(parseISO(startTime), 'yyyy-MM-dd') !== format(parseISO(endTime), 'yyyy-MM-dd');
  const windowLabel = crossDate
    ? t('createGame.locationTime.summaryCrossDate', {
        startDate: formatDate(startTime, displaySettings),
        start: formatTime(startTime, displaySettings),
        endDate: formatDate(endTime, displaySettings),
        end: formatTime(endTime, displaySettings),
      })
    : t('createGame.locationTime.summaryWindow', {
        start: formatTime(startTime, displaySettings),
        end: formatTime(endTime, displaySettings),
      });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        aria-live="polite"
        className="sticky bottom-0 z-10 rounded-xl border border-primary-200/80 dark:border-primary-800/80 bg-primary-50/70 dark:bg-primary-950/40 px-3 py-2.5"
      >
        <p className="text-xs font-medium text-primary-800 dark:text-primary-200">
          {t('createGame.locationTime.summaryFromBookings', { count: bookingCount })}
        </p>
        <p className="text-sm text-gray-800 dark:text-gray-200">{windowLabel}</p>
      </motion.div>
    </AnimatePresence>
  );
}
