import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type LinkedBookingChangeGateProps = {
  linkedCount: number;
  clubName?: string | null;
  onUnlink: () => void;
};

export function LinkedBookingChangeGate({
  linkedCount,
  clubName,
  onUnlink,
}: LinkedBookingChangeGateProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="linked-booking-change-gate"
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Lock size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('gameDetails.locationTime.changeGateTitle', { count: linkedCount })}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">
          {clubName
            ? t('gameDetails.locationTime.changeGateBodyClub', { club: clubName })
            : t('gameDetails.locationTime.changeGateBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={onUnlink}
        className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
      >
        {t('gameDetails.locationTime.reservationAction.unlink.chipTitle')}
      </button>
    </div>
  );
}
