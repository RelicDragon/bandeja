import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, Game } from '@/types';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { BooktimeBookingRow } from '@/components/booktime/BooktimeBookingRow';
import { clubToBooktimeRow, linkedBookingToRecord } from '@/components/booktime/booktimeBookingUtils';
import { getClubTimezone } from '@/utils/gameTimeDisplay';

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
  const clubTimezone = getClubTimezone(game);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const links = game.linkedBookings ?? [];
  const resolvedClub = club ?? game.court?.club ?? game.club;
  const booktimeClub = useMemo(
    () => (resolvedClub ? clubToBooktimeRow(resolvedClub) : null),
    [resolvedClub],
  );

  if (links.length === 0 || !booktimeClub) return null;

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
            resolvedClub?.courts?.find((c) => c.id === link.courtId) ??
            (game.court?.id === link.courtId ? game.court : undefined);
          const courtOverride = court
            ? {
                courtName: court.name,
                integrationCourtName: court.integrationCourtName ?? null,
              }
            : {
                courtName: t('club.booktime.unknownCourt'),
                integrationCourtName: null,
              };

          return (
            <BooktimeBookingRow
              key={link.id}
              booking={linkedBookingToRecord(link)}
              club={booktimeClub}
              readOnly
              compact
              clubTimezone={clubTimezone}
              courtOverride={courtOverride}
              trailing={
                !readOnly && onRemove ? (
                  <button
                    type="button"
                    data-testid="linked-booking-unlink"
                    onClick={() => setPendingRemove(link.externalBookingId)}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
                  >
                    {t('common.remove')}
                  </button>
                ) : undefined
              }
            />
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
