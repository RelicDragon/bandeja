import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import type { WeekdayKey } from '@/types';
import {
  WEEKDAYS,
  WEEKDAYS_SUNDAY_FIRST,
  WEEKEND_DAYS,
  getHour,
  dayIsFull,
  dayIsEmpty,
  getShortDayLabel,
  getShortDayLabelWithDate,
  getDayOfMonthInWeek,
  isWeekdayTodayInWeek,
  isWeekdayPastInWeek,
  formatHour,
} from '@/utils/availability';
import { useDragPaint } from '@/hooks/useDragPaint';
import { AvailabilityCell } from './AvailabilityCell';
import { AvailabilityDayHeader } from './AvailabilityDayHeader';
import { AvailabilityHourLabel } from './AvailabilityHourLabel';
import type { UseAvailabilityEditorReturn } from '@/hooks/useAvailabilityEditor';

type DragKey = string;

/** Matches AvailabilityDayHeader (label + menu) for hour-label column alignment. */
const DAY_HEADER_SPACER_CLASS = 'h-12 shrink-0';

interface AvailabilityGridProps {
  editor: UseAvailabilityEditorReturn;
  weekStartYmd: string;
  weekStart: 'monday' | 'sunday';
}

export const AvailabilityGrid = ({ editor, weekStartYmd, weekStart }: AvailabilityGridProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const order: WeekdayKey[] = useMemo(
    () => (user?.weekStart === 'sunday' ? WEEKDAYS_SUNDAY_FIRST : WEEKDAYS),
    [user?.weekStart]
  );

  const onPaint = useCallback(
    (key: DragKey, value: boolean) => {
      const [dayIdx, hourStr] = key.split(':');
      const day = order[Number(dayIdx)];
      editor.setHour(day, Number(hourStr), value);
    },
    [editor, order]
  );

  const { onPointerDown, onPointerEnter } = useDragPaint<DragKey>(onPaint);

  const handleDown = useCallback(
    (dayIndex: number, hour: number, currentValue: boolean, e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown(`${dayIndex}:${hour}`, currentValue, e);
    },
    [onPointerDown]
  );

  const handleEnter = useCallback(
    (dayIndex: number, hour: number, currentValue: boolean) => {
      onPointerEnter(`${dayIndex}:${hour}`, currentValue);
    },
    [onPointerEnter]
  );

  return (
    <div className="flex w-full justify-center overflow-x-hidden select-none">
      <div className="flex w-full min-w-0 max-w-full items-start gap-x-0.5">
        <div className="flex w-9 shrink-0 flex-col gap-y-0.5">
          <div className={DAY_HEADER_SPACER_CLASS} aria-hidden />
          {Array.from({ length: 24 }, (_, hour) => (
            <AvailabilityHourLabel
              key={hour}
              label={formatHour(hour, user?.timeFormat)}
              isMajor={hour % 3 === 0}
              onClick={() => editor.toggleHour(hour)}
              className="h-5 w-full justify-self-end md:h-6"
            />
          ))}
        </div>

        {order.map((d, di) => {
          const isToday = isWeekdayTodayInWeek(d, weekStartYmd, weekStart);
          const isPast = isWeekdayPastInWeek(d, weekStartYmd, weekStart);
          return (
            <div
              key={d}
              className="flex min-w-0 flex-1 flex-col items-center gap-y-0.5"
            >
              <AvailabilityDayHeader
                day={d}
                weekdayLabel={getShortDayLabel(t, d)}
                dayOfMonth={getDayOfMonthInWeek(weekStartYmd, d, weekStart)}
                weekStartYmd={weekStartYmd}
                weekStart={weekStart}
                isWeekend={WEEKEND_DAYS.includes(d)}
                isToday={isToday}
                isPast={isPast}
                captionOnlyHighlight
                allOn={dayIsFull(editor.value[d])}
                allOff={dayIsEmpty(editor.value[d])}
                onToggleDay={() => editor.toggleDay(d)}
                onCopyTo={(days) => editor.copyDayTo(d, days)}
              />
              {Array.from({ length: 24 }, (_, hour) => (
                <AvailabilityCell
                  key={hour}
                  dayIndex={di}
                  hour={hour}
                  isToday={isToday}
                  isPast={isPast}
                  on={getHour(editor.value[d], hour)}
                  ariaLabel={`${getShortDayLabelWithDate(t, d, weekStartYmd, weekStart)} ${formatHour(hour, user?.timeFormat)}`}
                  onPointerDown={handleDown}
                  onPointerEnter={handleEnter}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

