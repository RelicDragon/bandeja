import { useTranslation } from 'react-i18next';
import { AlertCircle, Check } from 'lucide-react';

type LinkedBookingCoverageBadgeProps = {
  fullyCovered: boolean;
};

export function LinkedBookingCoverageBadge({ fullyCovered }: LinkedBookingCoverageBadgeProps) {
  const { t } = useTranslation();

  if (fullyCovered) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        <Check size={12} className="shrink-0" aria-hidden />
        {t('gameDetails.linkedBookings.fullyCovered')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
      <AlertCircle size={12} className="shrink-0" aria-hidden />
      {t('gameDetails.linkedBookings.notFullyCovered')}
    </span>
  );
}
