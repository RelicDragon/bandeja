import { useTranslation } from 'react-i18next';

export function GameCardConfirmedCourtBadge() {
  const { t } = useTranslation();

  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-800 ring-1 ring-blue-200/80 dark:bg-blue-900/40 dark:text-blue-200 dark:ring-blue-800/60">
      {t('games.courtBookedBadge', { defaultValue: 'Booked' })}
    </span>
  );
}
