import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import type { Club, Court } from '@/types';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';

type BooktimeRealBookingSectionProps = {
  mode?: 'create' | 'edit';
  club: Club;
  courts: Court[];
  skipRealCourtBooking: boolean;
  onSkipRealCourtBookingChange: (value: boolean) => void;
};

export function BooktimeRealBookingSection({
  mode = 'create',
  club,
  courts,
  skipRealCourtBooking,
  onSkipRealCourtBookingChange,
}: BooktimeRealBookingSectionProps) {
  const { t } = useTranslation();
  const courtNames = courts
    .map((c) => resolveCourtNameParts(c.name, c.integrationCourtName).name)
    .join(', ');

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-900 dark:text-white min-w-0">
          {t('createGame.locationTime.skipRealCourtToggle')}
        </span>
        <div data-testid="skip-real-court-booking-toggle">
          <ToggleSwitch checked={skipRealCourtBooking} onChange={onSkipRealCourtBookingChange} />
        </div>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {skipRealCourtBooking
          ? t(
              mode === 'edit'
                ? 'createGame.locationTime.skipRealCourtHintEdit'
                : 'createGame.locationTime.skipRealCourtHint',
            )
          : t(
              mode === 'edit'
                ? 'createGame.locationTime.realCourtBookingHintEdit'
                : 'createGame.locationTime.realCourtBookingHint',
              { courts: courtNames, club: club.name },
            )}
      </p>
    </div>
  );
}
