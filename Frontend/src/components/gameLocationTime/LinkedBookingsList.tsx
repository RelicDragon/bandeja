import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, Game } from '@/types';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { clubToBooktimeRow } from '@/components/booktime/booktimeBookingUtils';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import { useBooktimeUserBookingIds } from '@/hooks/useBooktimeUserBookingIds';
import { LinkedBookingListItem } from './LinkedBookingListItem';

type LinkedBookingsListProps = {
  game: Game;
  club?: Club;
  courts?: Court[];
  onRemove?: (externalBookingId: string) => void;
  readOnly?: boolean;
  readOnlyLabel?: boolean;
  verifyOwnership?: boolean;
  onBookingUnlinked?: () => void | Promise<void>;
};

export function LinkedBookingsList({
  game,
  club,
  courts = [],
  onRemove,
  readOnly = false,
  readOnlyLabel = false,
  verifyOwnership = false,
  onBookingUnlinked,
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
  const { isOwner, reload } = useBooktimeUserBookingIds(
    booktimeClub?.clubId,
    booktimeClub?.companyId,
    verifyOwnership && Boolean(booktimeClub?.companyId),
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
        {links.map((link) => (
          <LinkedBookingListItem
            key={link.id}
            link={link}
            game={game}
            booktimeClub={booktimeClub}
            resolvedClub={resolvedClub}
            courts={courts}
            clubTimezone={clubTimezone}
            isOwner={verifyOwnership && isOwner(link.externalBookingId)}
            onRefreshOwnership={reload}
            readOnly={readOnly}
            onRemove={onRemove ? (id) => setPendingRemove(id) : undefined}
            onBookingUnlinked={onBookingUnlinked}
          />
        ))}
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
