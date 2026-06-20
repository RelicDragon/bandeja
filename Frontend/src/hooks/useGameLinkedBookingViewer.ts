import { useMemo } from 'react';
import type { Club, Game } from '@/types';
import { clubToBooktimeRow } from '@/components/booktime/booktimeBookingUtils';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { evaluateGameLinkedBookingCoverage } from '@/utils/gameHasConfirmedClubBooking';
import { useBooktimeUserBookingIds } from '@/hooks/useBooktimeUserBookingIds';

function resolveGameClub(game: Game): Club | undefined {
  return game.court?.club ?? game.club;
}

export function useGameLinkedBookingViewer(game: Game) {
  const club = resolveGameClub(game);
  const links = useMemo(() => game.linkedBookings ?? [], [game.linkedBookings]);
  const hasIntegration = clubHasBookingIntegration(club);
  const hasLinkedBookings = links.length > 0 && hasIntegration;
  const booktimeClub = useMemo(
    () => (club && hasIntegration ? clubToBooktimeRow(club) : null),
    [club, hasIntegration],
  );

  const { isOwner, loading } = useBooktimeUserBookingIds(
    booktimeClub?.clubId,
    booktimeClub?.companyId,
    hasLinkedBookings && Boolean(booktimeClub?.companyId),
  );

  const ownsAnyLinkedBooking = useMemo(
    () => links.some((link) => isOwner(link.externalBookingId)),
    [links, isOwner],
  );

  const coverage = useMemo(
    () =>
      evaluateGameLinkedBookingCoverage(game) ?? {
        courtCountMet: false,
        timeCoverageMet: false,
        fullyCovered: false,
        requiredBookingCount: 0,
      },
    [game],
  );

  const ownershipResolved = !loading || !hasLinkedBookings;

  return {
    hasLinkedBookings,
    coverage,
    showOwnerSection: hasLinkedBookings && ownershipResolved && ownsAnyLinkedBooking,
    showPublicCoverageBadge: hasLinkedBookings && ownershipResolved && !ownsAnyLinkedBooking,
  };
}
