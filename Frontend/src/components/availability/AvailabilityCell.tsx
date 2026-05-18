import { memo } from 'react';
import {
  availabilityTodayCellOffClass,
  availabilityTodayCellOffHoverClass,
  availabilityTodayCellOnAccentClass,
  availabilityPastMutedClass,
} from './availabilityTodayHighlight';

interface AvailabilityCellProps {
  on: boolean;
  isToday?: boolean;
  isPast?: boolean;
  dayIndex: number;
  hour: number;
  disabled?: boolean;
  ariaLabel: string;
  onPointerDown: (dayIndex: number, hour: number, currentValue: boolean) => void;
  onPointerEnter: (dayIndex: number, hour: number, currentValue: boolean) => void;
}

const AvailabilityCellImpl = ({
  on,
  isToday = false,
  isPast = false,
  dayIndex,
  hour,
  disabled,
  ariaLabel,
  onPointerDown,
  onPointerEnter,
}: AvailabilityCellProps) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).releasePointerCapture?.(e.pointerId);
        onPointerDown(dayIndex, hour, on);
      }}
      onPointerEnter={() => {
        if (disabled) return;
        onPointerEnter(dayIndex, hour, on);
      }}
      className={[
        'h-5 w-full max-w-10 md:h-6 rounded-[4px] touch-none select-none transition-all duration-150',
        'border',
        on
          ? [
              'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-500/40 shadow-sm hover:brightness-110',
              isToday ? availabilityTodayCellOnAccentClass : '',
            ].join(' ')
          : isToday
            ? `${availabilityTodayCellOffClass} ${availabilityTodayCellOffHoverClass}`
            : 'bg-gray-100 border-gray-200 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700',
        hour % 6 === 0 ? 'mt-0.5' : '',
        isPast && !isToday ? availabilityPastMutedClass : '',
      ].join(' ')}
      tabIndex={-1}
    />
  );
};

export const AvailabilityCell = memo(AvailabilityCellImpl);
