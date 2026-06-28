import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

interface GameCardBookedTagProps {
  linkedExternalBooking?: boolean;
}

export function GameCardBookedTag({
  linkedExternalBooking = false,
}: GameCardBookedTagProps) {
  const { t } = useTranslation();
  const label = t('games.courtBookedBadge', { defaultValue: 'Booked' });
  const colorClasses = linkedExternalBooking
    ? 'bg-emerald-100/95 text-emerald-800 ring-emerald-200/80 dark:bg-emerald-900/45 dark:text-emerald-200 dark:ring-emerald-800/60'
    : 'bg-blue-100/95 text-blue-800 ring-blue-200/80 dark:bg-blue-900/45 dark:text-blue-200 dark:ring-blue-800/60';

  return (
    <span
      className={`pointer-events-auto inline-flex min-h-[22px] items-center gap-0.5 rounded-md px-1.5 py-0 text-[9px] font-bold uppercase leading-none tracking-wide ring-1 backdrop-blur-sm shadow-sm ${colorClasses}`}
      aria-label={label}
      title={label}
    >
      {linkedExternalBooking ? <Check size={10} strokeWidth={3} aria-hidden /> : null}
      {label}
    </span>
  );
}
