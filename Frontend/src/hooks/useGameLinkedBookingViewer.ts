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
  const hasLinkedBookings =
    links.length > 0 ||
    game.bookingStatus === 'EXTERNAL_PARTIAL' ||
    game.bookingStatus === 'EXTERNAL_FULL';
  const hasIntegration = clubHasBookingIntegration(club);
  const booktimeClub = useMemo(
    () => (club && hasIntegration ? clubToBooktimeRow(club) : null),
    [club, hasIntegration],
  );

  const { isOwner, loading } = useBooktimeUserBookingIds(
    booktimeClub?.clubId,
    booktimeClub?.companyId,
    hasLinkedBookings && hasIntegration && Boolean(booktimeClub?.companyId),
  );

  const ownsAnyLinkedBooking = useMemo(
    () => links.some((link) => isOwner(link.externalBookingId)),
    [links, isOwner],
  );

  const coverage = useMemo(() => {
    if (game.bookingStatus === 'EXTERNAL_FULL') {
      return {
        courtCountMet: true,
        timeCoverageMet: true,
        fullyCovered: true,
        requiredBookingCount: 0,
      };
    }
    if (game.bookingStatus === 'EXTERNAL_PARTIAL') {
      return {
        courtCountMet: false,
        timeCoverageMet: false,
        fullyCovered: false,
        requiredBookingCount: 0,
      };
    }

    return (
      evaluateGameLinkedBookingCoverage(game) ?? {
        courtCountMet: false,
        timeCoverageMet: false,
        fullyCovered: false,
        requiredBookingCount: 0,
      }
    );
  }, [game]);

  const ownershipResolved = !loading || !hasLinkedBookings;

  return {
    hasLinkedBookings,
    coverage,
    showOwnerSection: hasLinkedBookings && hasIntegration && ownershipResolved && ownsAnyLinkedBooking,
    showPublicCoverageBadge:
      hasLinkedBookings && ownershipResolved && !ownsAnyLinkedBooking,
  };
}
