import { CalendarSearch, Link2Off } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ExistingReservationEmptyStateProps = {
  onReserveNow?: () => void;
  onGameOnly?: () => void;
};

export function ExistingReservationEmptyState({
  onReserveNow,
  onGameOnly,
}: ExistingReservationEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <section
      className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/50"
      data-testid="existing-reservation-empty-state"
    >
      <div className="flex gap-3">
        <Link2Off
          size={20}
          className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('createGame.locationTime.emptyBookingsOnDate')}
            </p>
            <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">
              {t('createGame.locationTime.emptyBookingsHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onReserveNow ? (
              <button
                type="button"
                onClick={onReserveNow}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400"
              >
                <CalendarSearch size={14} aria-hidden />
                {t('createGame.locationTime.emptyBookingsReserveNow')}
              </button>
            ) : null}
            {onGameOnly ? (
              <button
                type="button"
                onClick={onGameOnly}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                {t('createGame.locationTime.emptyBookingsGameOnly')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
