import { useMemo, useState } from 'react';
import type { WeekdayKey } from '@/types';
import { getShortDayLabelWithDate } from '@/utils/availability';
import { useTranslation } from 'react-i18next';
import { AvailabilityCopyMenu } from './AvailabilityCopyMenu';
import {
  availabilityTodayCaptionTextClass,
  availabilityTodayHeaderClass,
  availabilityPastMutedClass,
} from './availabilityTodayHighlight';

interface AvailabilityDayHeaderProps {
  day: WeekdayKey;
  weekdayLabel: string;
  dayOfMonth: number;
  weekStartYmd: string;
  weekStart: 'monday' | 'sunday';
  isWeekend: boolean;
  isToday?: boolean;
  isPast?: boolean;
  captionOnlyHighlight?: boolean;
  allOn: boolean;
  allOff: boolean;
  onToggleDay: () => void;
  onCopyTo: (days: WeekdayKey[]) => void;
}

export const AvailabilityDayHeader = ({
  day,
  weekdayLabel,
  dayOfMonth,
  weekStartYmd,
  weekStart,
  isWeekend,
  isToday = false,
  isPast = false,
  captionOnlyHighlight = false,
  allOn,
  allOff,
  onToggleDay,
  onCopyTo,
}: AvailabilityDayHeaderProps) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const fullLabel = useMemo(
    () => getShortDayLabelWithDate(t, day, weekStartYmd, weekStart),
    [t, day, weekStartYmd, weekStart]
  );

  return (
    <div className="relative w-full max-w-10">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-label={t('profile.availability.dayMenu.open', { day: fullLabel })}
        onClick={() => setMenuOpen((v) => !v)}
        className={[
          'relative flex h-12 w-full min-h-12 flex-col items-center justify-center gap-0 rounded-lg border px-1 py-1 transition-colors',
          'border-gray-200 bg-white/90 shadow-sm dark:border-gray-600 dark:bg-gray-900/60',
          'hover:border-gray-300 hover:bg-gray-50 dark:hover:border-gray-500 dark:hover:bg-gray-800/80',
          'active:scale-[0.98]',
          menuOpen ? 'border-primary-400 ring-1 ring-primary-500/30' : '',
          isWeekend ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300',
          isToday && captionOnlyHighlight
            ? `${availabilityTodayHeaderClass} ${availabilityTodayCaptionTextClass}`
            : '',
          allOn && !isToday ? 'border-primary-400/50 bg-primary-500/10 dark:bg-primary-500/20' : '',
          allOff && !isToday ? 'opacity-60' : '',
          isPast && !isToday ? availabilityPastMutedClass : '',
        ].join(' ')}
      >
        <span className="text-[9px] font-semibold uppercase leading-none tracking-tight sm:text-[10px]">
          {weekdayLabel}
        </span>
        <span className="mt-0.5 text-[11px] font-bold tabular-nums leading-none sm:text-xs">
          {dayOfMonth}
        </span>
      </button>
      <AvailabilityCopyMenu
        open={menuOpen}
        sourceDay={day}
        weekdayLabel={weekdayLabel}
        dayOfMonth={dayOfMonth}
        weekStartYmd={weekStartYmd}
        weekStart={weekStart}
        allOn={allOn}
        onToggleDay={() => {
          onToggleDay();
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
        onSelect={(days) => {
          onCopyTo(days);
          setMenuOpen(false);
        }}
      />
    </div>
  );
};
