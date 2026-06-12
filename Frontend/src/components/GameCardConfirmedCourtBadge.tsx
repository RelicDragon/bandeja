import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

type Props = {
  linkedExternalBooking?: boolean;
};

export function GameCardConfirmedCourtBadge({ linkedExternalBooking = false }: Props) {
  const { t } = useTranslation();

  if (linkedExternalBooking) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800/60">
        <Check size={10} strokeWidth={3} aria-hidden />
        {t('games.courtBookedBadge', { defaultValue: 'Booked' })}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 ring-1 ring-blue-200/80 dark:bg-blue-900/40 dark:text-blue-200 dark:ring-blue-800/60">
      {t('games.courtBookedBadge', { defaultValue: 'Booked' })}
    </span>
  );
}
