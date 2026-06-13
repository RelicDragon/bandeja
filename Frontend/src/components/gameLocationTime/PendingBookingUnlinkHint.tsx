import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

export function PendingBookingUnlinkHint() {
  const { t } = useTranslation();

  return (
    <div
      data-testid="pending-booking-unlink-hint"
      className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5 flex gap-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <Info size={16} className="shrink-0 mt-0.5" aria-hidden />
      <p>{t('gameDetails.locationTime.unlinkNoCancelHint')}</p>
    </div>
  );
}
