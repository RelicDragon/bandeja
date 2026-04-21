import { memo } from 'react';

interface AvailabilityCellProps {
  on: boolean;
  dayIndex: number;
  hour: number;
  disabled?: boolean;
  ariaLabel: string;
  onPointerDown: (dayIndex: number, hour: number, currentValue: boolean) => void;
  onPointerEnter: (dayIndex: number, hour: number, currentValue: boolean) => void;
}

const AvailabilityCellImpl = ({
  on,
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
        'w-full h-5 md:h-6 rounded-[4px] touch-none select-none transition-all duration-150',
        'border',
        on
          ? 'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-500/40 shadow-sm hover:brightness-110'
          : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700',
        hour % 6 === 0 ? 'mt-0.5' : '',
      ].join(' ')}
      tabIndex={-1}
    />
  );
};

export const AvailabilityCell = memo(AvailabilityCellImpl);
