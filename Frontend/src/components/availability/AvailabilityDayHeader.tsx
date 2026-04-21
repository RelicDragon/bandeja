import { useState, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import type { WeekdayKey } from '@/types';
import { AvailabilityCopyMenu } from './AvailabilityCopyMenu';

interface AvailabilityDayHeaderProps {
  day: WeekdayKey;
  label: string;
  isWeekend: boolean;
  allOn: boolean;
  allOff: boolean;
  onToggle: () => void;
  onCopyTo: (days: WeekdayKey[]) => void;
}

export const AvailabilityDayHeader = ({
  day,
  label,
  isWeekend,
  allOn,
  allOff,
  onToggle,
  onCopyTo,
}: AvailabilityDayHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef} className="relative flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={[
          'w-full text-[11px] font-semibold uppercase tracking-wide px-1.5 py-1 rounded-md transition-colors',
          isWeekend ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300',
          allOn ? 'bg-primary-500/10 dark:bg-primary-500/20' : '',
          allOff ? 'opacity-60' : '',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
        ].join(' ')}
        title={label}
      >
        {label}
      </button>
      <button
        type="button"
        aria-label="day menu"
        onClick={() => setMenuOpen((v) => !v)}
        className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <MoreVertical size={12} />
      </button>
      {menuOpen && (
        <AvailabilityCopyMenu
          sourceDay={day}
          onClose={() => setMenuOpen(false)}
          onSelect={(days) => {
            onCopyTo(days);
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
};
