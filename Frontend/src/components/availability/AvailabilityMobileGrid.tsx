import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import type { AvailabilityBucketBoundaries, WeekdayKey } from '@/types';
import {
  WEEKDAYS,
  WEEKDAYS_SUNDAY_FIRST,
  WEEKEND_DAYS,
  getShortDayLabelWithDate,
  isWeekdayTodayInWeek,
  isWeekdayPastInWeek,
  dayIsFull,
  dayIsEmpty,
  BUCKET_ORDER,
  bucketIsFullFor,
  bucketIsPartialFor,
} from '@/utils/availability';
import type { UseAvailabilityEditorReturn } from '@/hooks/useAvailabilityEditor';
import { BUCKET_META } from './bucketMeta';
import {
  availabilityTodayCaptionTextClass,
  availabilityTodayCellOffClass,
  availabilityTodayCellOffHoverClass,
  availabilityTodayCellOnAccentClass,
  availabilityTodayCellPartialClass,
  availabilityTodayHeaderClass,
  availabilityPastMutedClass,
} from './availabilityTodayHighlight';

interface AvailabilityMobileGridProps {
  editor: UseAvailabilityEditorReturn;
  boundaries: AvailabilityBucketBoundaries;
  weekStartYmd: string;
  weekStart: 'monday' | 'sunday';
}

/** Fluid bucket columns (shrink on narrow screens); day column capped. `min-w-0` avoids grid overflow. */
const MOBILE_GRID_CLASS =
  'grid w-full min-w-0 grid-cols-[minmax(2.125rem,2.75rem)_repeat(4,minmax(0,1fr))] gap-x-1 gap-y-1 sm:gap-x-1.5 sm:gap-y-1';

export const AvailabilityMobileGrid = ({
  editor,
  boundaries,
  weekStartYmd,
  weekStart,
}: AvailabilityMobileGridProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const order: WeekdayKey[] = useMemo(
    () => (user?.weekStart === 'sunday' ? WEEKDAYS_SUNDAY_FIRST : WEEKDAYS),
    [user?.weekStart]
  );

  return (
    <div className="w-full min-w-0 space-y-1.5">
      <div className={`${MOBILE_GRID_CLASS} items-end`}>
        <div className="min-w-0" aria-hidden />
        {BUCKET_ORDER.map((b) => {
          const meta = BUCKET_META[b];
          return (
            <div
              key={b}
              className="flex min-w-0 flex-col items-center gap-0.5 pb-0.5 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-gray-500 dark:text-gray-400 sm:text-[10px]"
            >
              <meta.Icon strokeWidth={2} className="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500 sm:h-3.5 sm:w-3.5" />
              <span className="line-clamp-2 w-full break-words px-px">{t(meta.labelKey)}</span>
            </div>
          );
        })}
      </div>

      {order.map((d) => {
        const isWeekend = WEEKEND_DAYS.includes(d);
        const isToday = isWeekdayTodayInWeek(d, weekStartYmd, weekStart);
        const isPast = isWeekdayPastInWeek(d, weekStartYmd, weekStart);
        const allOn = dayIsFull(editor.value[d]);
        const allOff = dayIsEmpty(editor.value[d]);
        return (
          <div
            key={d}
            className={`${MOBILE_GRID_CLASS} items-center`}
          >
            <button
              type="button"
              onClick={() => editor.toggleDay(d)}
              className={[
                'flex min-h-0 w-full min-w-0 flex-col items-center justify-center self-stretch rounded-xl px-0.5 py-1.5 text-[9px] font-bold leading-tight tracking-tight transition-colors sm:text-[10px]',
                isWeekend ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300',
                isToday
                  ? `${availabilityTodayHeaderClass} ${availabilityTodayCaptionTextClass}`
                  : '',
                allOn && !isToday ? 'bg-primary-500/10 dark:bg-primary-500/20' : '',
                allOff && !isToday ? 'opacity-50' : '',
                !isToday ? 'hover:bg-gray-100 dark:hover:bg-gray-800' : 'hover:bg-amber-300/90 dark:hover:bg-amber-600/48',
                isPast && !isToday ? availabilityPastMutedClass : '',
              ].join(' ')}
            >
              {getShortDayLabelWithDate(t, d, weekStartYmd, weekStart)}
            </button>
            {BUCKET_ORDER.map((b) => {
              const full = bucketIsFullFor(editor.value, d, b, boundaries);
              const partial = bucketIsPartialFor(editor.value, d, b, boundaries);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => editor.toggleBucketOn(d, b)}
                  aria-pressed={full}
                  className={[
                    'aspect-square w-full min-w-0 rounded-xl border transition-all duration-150',
                    'flex min-h-0 items-center justify-center shadow-sm',
                    full
                      ? [
                          'border-primary-500/40 bg-gradient-to-br from-primary-500 to-primary-600',
                          isToday ? availabilityTodayCellOnAccentClass : '',
                        ].join(' ')
                      : partial
                        ? isToday
                          ? availabilityTodayCellPartialClass
                          : 'border-primary-500/30 bg-primary-500/20'
                        : isToday
                          ? `${availabilityTodayCellOffClass} ${availabilityTodayCellOffHoverClass}`
                          : 'border-gray-200 bg-gray-100 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700',
                    'active:scale-95',
                    isPast && !isToday ? availabilityPastMutedClass : '',
                  ].join(' ')}
                >
                  {full && <span className="size-1.5 rounded-full bg-white/90 shadow-sm" />}
                  {partial && !full && <span className="size-1.5 rounded-full bg-primary-500" />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
