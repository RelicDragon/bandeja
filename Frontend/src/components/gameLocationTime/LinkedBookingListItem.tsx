import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import type { Club, Court, Game } from '@/types';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { UserBooktimeBookingIdsResult } from '@/integrations/booktime/userBookingsCheck';
import { gamesApi } from '@/api';
import { BooktimeBookingRow } from '@/components/booktime/BooktimeBookingRow';
import { linkedBookingToRecord } from '@/components/booktime/booktimeBookingUtils';
import { useBooktimeLinkedGames } from '@/hooks/useBooktimeLinkedGames';
import { LinkedBookingAbsentModal } from './LinkedBookingAbsentModal';

type LinkedBookingLink = NonNullable<Game['linkedBookings']>[number];

type LinkedBookingListItemProps = {
  link: LinkedBookingLink;
  game: Game;
  booktimeClub: BooktimeMyClubRow;
  resolvedClub?: Club;
  courts: Court[];
  clubTimezone: string | null;
  isOwner: boolean;
  onRefreshOwnership: () => Promise<UserBooktimeBookingIdsResult | null>;
  readOnly: boolean;
  onRemove?: (externalBookingId: string) => void;
  onBookingUnlinked?: () => void | Promise<void>;
};

export function LinkedBookingListItem({
  link,
  game,
  booktimeClub,
  resolvedClub,
  courts,
  clubTimezone,
  isOwner,
  onRefreshOwnership,
  readOnly,
  onRemove,
  onBookingUnlinked,
}: LinkedBookingListItemProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [absentOpen, setAbsentOpen] = useState(false);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const { linkedGames } = useBooktimeLinkedGames(link.externalBookingId, absentOpen);

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

  const otherLinkedGameCount = linkedGames.filter((g) => g.id !== game.id).length;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await onRefreshOwnership();
      if (!result?.authenticated) {
        toast.error(t('club.booktime.bookRequiresConnect'));
        return;
      }
      if (result.ids.has(link.externalBookingId)) {
        toast.success(t('gameDetails.linkedBookings.refreshStillActive'));
        return;
      }
      setAbsentOpen(true);
    } catch {
      toast.error(t('gameDetails.linkedBookings.refreshCheckFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleConfirmAbsent = async () => {
    setUnlinkBusy(true);
    try {
      await gamesApi.patchBookings(game.id, { remove: [link.externalBookingId] });
      await onBookingUnlinked?.();
      setAbsentOpen(false);
      toast.success(t('gameDetails.linkedBookings.absentSuccess'));
    } catch {
      toast.error(t('gameDetails.linkedBookings.absentFailed'));
    } finally {
      setUnlinkBusy(false);
    }
  };

  const trailing = (
    <div className="flex items-center gap-2 shrink-0">
      {isOwner ? (
        <button
          type="button"
          data-testid="linked-booking-refresh"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          aria-label={t('gameDetails.linkedBookings.refreshAriaLabel')}
          title={t('gameDetails.linkedBookings.refreshAriaLabel')}
        >
          {refreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      ) : null}
      {!readOnly && onRemove ? (
        <button
          type="button"
          data-testid="linked-booking-unlink"
          onClick={() => onRemove(link.externalBookingId)}
          className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
        >
          {t('common.remove')}
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <BooktimeBookingRow
        booking={linkedBookingToRecord(link)}
        club={booktimeClub}
        readOnly
        compact
        clubTimezone={clubTimezone}
        courtOverride={courtOverride}
        trailing={isOwner || (!readOnly && onRemove) ? trailing : undefined}
      />
      <LinkedBookingAbsentModal
        isOpen={absentOpen}
        otherLinkedGameCount={otherLinkedGameCount}
        isLoading={unlinkBusy}
        onClose={() => setAbsentOpen(false)}
        onConfirm={() => void handleConfirmAbsent()}
      />
    </>
  );
}
