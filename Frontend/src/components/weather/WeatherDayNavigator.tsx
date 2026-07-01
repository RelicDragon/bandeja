import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WeatherDayGroup } from '@/utils/weatherDayGroups';
import { formatWeatherDayLabel, formatWeatherDayRange } from '@/utils/weatherDayGroups';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { WeatherIcon } from './WeatherIcon';
import { getWeatherIconPalette } from './weatherIconPalette';

interface WeatherDayNavigatorProps {
  dayGroups: WeatherDayGroup[];
  selectedDayKey: string;
  gameDayKey: string;
  canReturnToGameDay: boolean;
  timezone: string;
  locale: string;
  onPrevious: () => void;
  onNext: () => void;
  onGoToGameDay: () => void;
}

const navButtonClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white';

function WeatherDayNavigatorInner({
  dayGroups,
  selectedDayKey,
  gameDayKey,
  canReturnToGameDay,
  timezone,
  locale,
  onPrevious,
  onNext,
  onGoToGameDay,
}: WeatherDayNavigatorProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const selectedIndex = dayGroups.findIndex((group) => group.dayKey === selectedDayKey);
  const selectedGroup = selectedIndex >= 0 ? dayGroups[selectedIndex] : null;
  const isGameDay = canReturnToGameDay && selectedDayKey === gameDayKey;
  const showGameDayCta = canReturnToGameDay && !isGameDay;
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < dayGroups.length - 1;
  const label = selectedGroup
    ? formatWeatherDayLabel(selectedGroup.dayKey, timezone, locale, t)
    : '';
  const rangeLabel = selectedGroup ? formatWeatherDayRange(selectedGroup, locale) : '';
  const iconPalette = selectedGroup
    ? getWeatherIconPalette(selectedGroup.middayPoint.conditionKey, selectedGroup.middayPoint.isDay)
    : null;

  return (
    <div className="mb-3 shrink-0">
      <div
        className="flex items-center gap-1 rounded-xl bg-gray-50/90 px-1 py-1.5 dark:bg-gray-900/70"
        role="group"
        aria-label={t('weather.forecastTitle', { defaultValue: 'Game weather' })}
      >
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className={navButtonClass}
          aria-label={t('weather.previousDay', { defaultValue: 'Previous day' })}
        >
          <ChevronLeft size={18} />
        </motion.button>

        <div className="min-w-0 flex-1 px-1 text-center">
          <div className="flex items-center justify-center gap-2">
            {selectedGroup && iconPalette ? (
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                style={{
                  backgroundColor: iconPalette.surfaceColor,
                  borderColor: iconPalette.borderColor,
                }}
              >
                <WeatherIcon
                  conditionKey={selectedGroup.middayPoint.conditionKey}
                  isDay={selectedGroup.middayPoint.isDay}
                  size={14}
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{label}</div>
              {rangeLabel ? (
                <div className="truncate text-xs tabular-nums text-gray-500 dark:text-gray-400">{rangeLabel}</div>
              ) : null}
            </div>
          </div>
          {dayGroups.length > 1 ? (
            <div className="mt-0.5 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
              {t('weather.dayCounter', {
                current: selectedIndex + 1,
                total: dayGroups.length,
                defaultValue: '{{current}} / {{total}}',
              })}
            </div>
          ) : null}
        </div>

        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          onClick={onNext}
          disabled={!canGoNext}
          className={navButtonClass}
          aria-label={t('weather.nextDay', { defaultValue: 'Next day' })}
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {showGameDayCta ? (
          <motion.div
            key="game-day-cta"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <button
              type="button"
              onClick={onGoToGameDay}
              className="mx-auto mt-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
            >
              {t('weather.goToGameDay', { defaultValue: 'Go to game day' })}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const WeatherDayNavigator = memo(WeatherDayNavigatorInner);
