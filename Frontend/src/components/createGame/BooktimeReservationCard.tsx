import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../ToggleSwitch';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import type { Club, Court } from '@/types';

type BooktimeReservationCardProps = {
  club: Club;
  court: Court;
  enabled: boolean;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function BooktimeReservationCard({
  club,
  court,
  enabled,
  checked,
  disabled,
  onChange,
}: BooktimeReservationCardProps) {
  const { t } = useTranslation();

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-900 dark:text-white min-w-0 pr-2">
          {t('createGame.booktime.switchLabel')}
        </span>
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {t('createGame.booktime.switchHint', {
          court: resolveCourtNameParts(court.name, court.integrationCourtName).name,
          club: club.name,
        })}
      </p>
    </div>
  );
}
