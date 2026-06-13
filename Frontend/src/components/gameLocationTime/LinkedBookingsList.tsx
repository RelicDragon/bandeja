import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, Game } from '@/types';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { formatDate } from '@/utils/dateFormat';
import { parseISO } from 'date-fns';

type LinkedBookingsListProps = {
  game: Game;
  club?: Club;
  courts?: Court[];
  onRemove?: (externalBookingId: string) => void;
  readOnly?: boolean;
  readOnlyLabel?: boolean;
};

export function LinkedBookingsList({
  game,
  club,
  courts = [],
  onRemove,
  readOnly = false,
  readOnlyLabel = false,
}: LinkedBookingsListProps) {
  const { t } = useTranslation();
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const links = game.linkedBookings ?? [];

  if (links.length === 0) return null;

  return (
    <div className="space-y-3">
      {readOnlyLabel ? (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {t('createGame.locationTime.linkedOnlyLabel')}
        </p>
      ) : null}
      <ul className="space-y-2">
        {links.map((link) => {
          const court =
            courts.find((c) => c.id === link.courtId) ??
            club?.courts?.find((c) => c.id === link.courtId) ??
            game.court;
          const when =
            link.bookingStart && link.bookingEnd
              ? `${formatDate(parseISO(link.bookingStart), 'EEE d MMM')} · ${new Date(link.bookingStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : null;
          return (
            <li
              key={link.id}
              data-testid="linked-booking-card"
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                {court ? (
                  <CourtDisplayName
                    name={court.name}
                    integrationName={court.integrationCourtName}
                    primaryClassName="text-sm font-medium text-gray-900 dark:text-white truncate"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {t('club.booktime.unknownCourt')}
                  </p>
                )}
                {when ? <p className="text-xs text-gray-500 dark:text-gray-400">{when}</p> : null}
              </div>
              {!readOnly && onRemove ? (
                <button
                  type="button"
                  data-testid="linked-booking-unlink"
                  onClick={() => setPendingRemove(link.externalBookingId)}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
                >
                  {t('common.remove')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!readOnly && onRemove ? (
        <ConfirmationModal
          isOpen={pendingRemove != null}
          onClose={() => setPendingRemove(null)}
          onConfirm={() => {
            if (pendingRemove) onRemove(pendingRemove);
            setPendingRemove(null);
          }}
          title={t('createGame.locationTime.unlinkConfirm')}
          message={
            (links.length === 1
              ? t('createGame.locationTime.unlinkLastConfirm')
              : t('createGame.locationTime.unlinkConfirm')) +
            ' ' +
            t('createGame.locationTime.unlinkNoCancelNote')
          }
          confirmText={t('common.remove')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
        />
      ) : null}
    </div>
  );
}
