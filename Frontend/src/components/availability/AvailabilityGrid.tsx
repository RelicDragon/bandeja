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
  formatHour,
} from '@/utils/availability';
import { useDragPaint } from '@/hooks/useDragPaint';
import { AvailabilityCell } from './AvailabilityCell';
import { AvailabilityDayHeader } from './AvailabilityDayHeader';
import { AvailabilityHourLabel } from './AvailabilityHourLabel';
import type { UseAvailabilityEditorReturn } from '@/hooks/useAvailabilityEditor';

type DragKey = string;

interface AvailabilityGridProps {
  editor: UseAvailabilityEditorReturn;
}

export const AvailabilityGrid = ({ editor }: AvailabilityGridProps) => {
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
    (dayIndex: number, hour: number, currentValue: boolean) => {
      onPointerDown(`${dayIndex}:${hour}`, currentValue);
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
    <div
      className="select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(7, minmax(0, 1fr))' }}>
        <div />
        {order.map((d) => (
          <AvailabilityDayHeader
            key={d}
            day={d}
            label={getShortDayLabel(t, d)}
            isWeekend={WEEKEND_DAYS.includes(d)}
            allOn={dayIsFull(editor.value[d])}
            allOff={dayIsEmpty(editor.value[d])}
            onToggle={() => editor.toggleDay(d)}
            onCopyTo={(days) => editor.copyDayTo(d, days)}
          />
        ))}

        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="contents">
            <AvailabilityHourLabel
              label={formatHour(hour, user?.timeFormat)}
              isMajor={hour % 3 === 0}
              onClick={() => editor.toggleHour(hour)}
            />
            {order.map((d, di) => (
              <AvailabilityCell
                key={`${d}-${hour}`}
                dayIndex={di}
                hour={hour}
                on={getHour(editor.value[d], hour)}
                ariaLabel={`${getShortDayLabel(t, d)} ${formatHour(hour, user?.timeFormat)}`}
                onPointerDown={handleDown}
                onPointerEnter={handleEnter}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
