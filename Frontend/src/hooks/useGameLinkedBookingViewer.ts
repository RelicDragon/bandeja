import { useMemo } from 'react';
import type { Club, Game } from '@/types';
import { clubToBooktimeRow } from '@/components/booktime/booktimeBookingUtils';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { useBooktimeUserBookingIds } from '@/hooks/useBooktimeUserBookingIds';

function resolveGameClub(game: Game): Club | undefined {
  return game.court?.club ?? game.club;
}

/**
 * Which of the game's linked reservations sit in the VIEWER's club account.
 * Club-side actions (verify, cancel at the club) only make sense for those:
 * a co-organizer checking someone else's booking would always see it "missing".
 * `enabled = false` skips the provider lookup (e.g. players without edit rights).
 */
export function useGameLinkedBookingViewer(game: Game, enabled = true) {
  const club = resolveGameClub(game);
  const links = useMemo(() => game.linkedBookings ?? [], [game.linkedBookings]);
  const hasLinkedBookings =
    links.length > 0 ||
    game.bookingStatus === 'EXTERNAL_PARTIAL' ||
    game.bookingStatus === 'EXTERNAL_FULL';
  const hasIntegration = clubHasBookingIntegration(club);
  const booktimeClub = useMemo(
    () => (club && hasIntegration ? clubToBooktimeRow(club) : null),
    [club, hasIntegration],
  );

  const { isOwner, loading, reload } = useBooktimeUserBookingIds(
    booktimeClub?.clubId,
    booktimeClub?.companyId,
    enabled &&
      hasLinkedBookings &&
      hasIntegration &&
      (Boolean(booktimeClub?.companyId) || booktimeClub?.integrationType === 'WELTNER'),
    booktimeClub?.integrationType,
  );

  const ownsAnyLinkedBooking = useMemo(
    () => links.some((link) => isOwner(link.externalBookingId)),
    [links, isOwner],
  );

  const ownershipResolved = !loading || !hasLinkedBookings;

  // Coverage is not reported here: the reservation summary
  // (`utils/courtReservationView`) is the one read-side for that.
  return {
    hasLinkedBookings,
    showOwnerSection: hasLinkedBookings && hasIntegration && ownershipResolved && ownsAnyLinkedBooking,
    /** The reservation is in the viewer's club account (false while unknown). */
    ownsBooking: isOwner,
    ownershipResolved,
    reloadOwnership: reload,
  };
}
