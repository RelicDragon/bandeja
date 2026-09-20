import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, Repeat, X } from 'lucide-react';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import type { SeriesCadence } from '@/api/series';
import {
  formatDayKey,
  formatLocalTime,
  formatWeekdayName,
  repeatSummaryKey,
  resolveLocale,
} from './seriesFormat';
import { useMySeries } from './useSeries';

/**
 * PRD 345 — the **Repeat** row in create-game Scheduling.
 *
 * `Once · Weekly · Every 2 weeks`. Picking a cadence reveals the summary line
 * ("Every Tuesday at 19:00, from 24 Sep") and the optional **Until** chip. The
 * owner cap disables the two repeating options with a helper line rather than
 * hiding them, so the limit is explained where it bites.
 *
 * The component owns no server state: the parent keeps `cadence` / `endsOn`
 * and converts the game into a series after it is created.
 */

export type RepeatChoice = 'ONCE' | SeriesCadence;

export interface SeriesRepeatRowProps {
  cadence: RepeatChoice;
  onCadenceChange: (next: RepeatChoice) => void;
  endsOn: string;
  onEndsOnChange: (next: string) => void;
  /** The game's own date — seeds the weekday and the "from" part of the summary. */
  startDate: Date;
  /** `HH:mm` the game starts at. */
  startTimeLocal: string;
  onManageSeries?: () => void;
  className?: string;
}

export const SeriesRepeatRow = ({
  cadence,
  onCadenceChange,
  endsOn,
  onEndsOnChange,
  startDate,
  startTimeLocal,
  onManageSeries,
  className = '',
}: SeriesRepeatRowProps) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [untilOpen, setUntilOpen] = useState(false);

  const enabled = isGameSeriesEnabled();
  const { data: mySeries } = useMySeries(enabled);
  const capReached =
    typeof mySeries?.activeCount === 'number' &&
    typeof mySeries?.maxActive === 'number' &&
    mySeries.activeCount >= mySeries.maxActive;

  const locale = i18n.language;
  const weekday = useMemo(() => {
    const day = startDate.getDay();
    return day === 0 ? 7 : day;
  }, [startDate]);

  const summary = useMemo(() => {
    if (cadence === 'ONCE') return null;
    return t(repeatSummaryKey(cadence), {
      weekday: formatWeekdayName(weekday, locale),
      time: formatLocalTime(startTimeLocal, locale),
      date: new Intl.DateTimeFormat(resolveLocale(locale), {
        day: 'numeric',
        month: 'short',
      }).format(startDate),
    });
  }, [cadence, locale, startDate, startTimeLocal, t, weekday]);

  if (!enabled) return null;

  return (
    <section className={`flex flex-col gap-2 ${className}`.trim()}>
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {t('series.repeat')}
        </h3>
      </div>

      <SegmentedSwitch
        layoutId="create-game-repeat"
        ariaLabel={t('series.cadenceAriaLabel')}
        fullWidth
        size="sm"
        showOnlyActiveTabText={false}
        activeId={cadence}
        onChange={(id) => onCadenceChange(id as RepeatChoice)}
        tabs={[
          { id: 'ONCE', label: t('series.cadenceOnce') },
          {
            id: 'WEEKLY',
            label: t('series.cadenceWeekly'),
            disabled: capReached,
            title: capReached ? t('series.capReached', { count: mySeries?.maxActive }) : undefined,
          },
          {
            id: 'BIWEEKLY',
            label: t('series.cadenceBiweekly'),
            disabled: capReached,
            title: capReached ? t('series.capReached', { count: mySeries?.maxActive }) : undefined,
          },
        ]}
      />

      <AnimatePresence initial={false}>
        {cadence !== 'ONCE' && (
          <motion.div
            key="repeat-details"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="text-xs text-gray-600 dark:text-gray-300">{summary}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {endsOn ? (
                <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                  <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                  {t('series.untilValue', { date: formatDayKey(endsOn, locale, 'dayMonth') })}
                  <button
                    type="button"
                    onClick={() => {
                      onEndsOnChange('');
                      setUntilOpen(false);
                    }}
                    aria-label={t('series.untilClear')}
                    className="ms-0.5 rounded-full p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setUntilOpen((prev) => !prev)}
                  aria-expanded={untilOpen}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                  {t('series.until')}
                </button>
              )}

              {untilOpen && !endsOn && (
                <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gray-100 px-3 dark:bg-gray-800">
                  <span className="sr-only">{t('series.until')}</span>
                  <input
                    type="date"
                    value={endsOn}
                    onChange={(event) => onEndsOnChange(event.target.value)}
                    className="bg-transparent text-sm text-gray-900 outline-none dark:text-white"
                  />
                </label>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {capReached && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('series.capReached', { count: mySeries?.maxActive })}
          {onManageSeries && (
            <button
              type="button"
              onClick={onManageSeries}
              className="ms-1 font-semibold underline-offset-2 hover:underline"
            >
              {t('series.capReachedLink')}
            </button>
          )}
        </p>
      )}
    </section>
  );
};
