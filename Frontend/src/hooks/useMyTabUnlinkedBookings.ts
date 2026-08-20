import { useMemo } from 'react';
import type { BooktimeLinkedGame } from '@/api/booktime';
import { resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import type { AggregatedClubBooking } from '@/hooks/useAllUpcomingClubBookings';
import { useBooktimeLinkedGamesByBookingIds } from '@/hooks/useBooktimeLinkedGamesByBookingIds';
import type { MyTabClubBookingsSnapshot } from '@/hooks/useMyTabClubBookings';
import type { Game } from '@/types';
import {
  resolveUnlinkedMyTabBookings,
  seedLinkedGamesFromMyGames,
} from '@/utils/unlinkedMyTabBookings';

export type MyTabUnlinkedBookingsState = {
  bookings: AggregatedClubBooking[];
  visible: boolean;
  pending: boolean;
  linkedGamesByBookingId: ReadonlyMap<string, BooktimeLinkedGame[]>;
  reloadLinkedGames: () => Promise<void>;
};

export function useMyTabUnlinkedBookings(
  booktime: Pick<MyTabClubBookingsSnapshot, 'bookings' | 'bookingsLoading' | 'clubs'>,
  games: Game[],
): MyTabUnlinkedBookingsState {
  const { bookings, bookingsLoading, clubs } = booktime;
  const clubById = useMemo(
    () => new Map(clubs.filter((club) => club.connected).map((club) => [club.clubId, club])),
    [clubs],
  );
  const bookingIds = useMemo(() => bookings.map((booking) => booking.uuid), [bookings]);
  const { linkedGamesByBookingId, loading: apiLoading, error: apiError, reload } =
    useBooktimeLinkedGamesByBookingIds(bookingIds, bookingIds.length > 0);
  const seedByBookingId = useMemo(() => seedLinkedGamesFromMyGames(games), [games]);
  const timeZoneOf = useMemo(
    () => (booking: AggregatedClubBooking) => {
      const club = booking.clubId ? clubById.get(booking.clubId) : undefined;
      return club ? resolveBooktimeMyClubTimezone(club) : undefined;
    },
    [clubById],
  );

  const resolved = useMemo(
    () =>
      resolveUnlinkedMyTabBookings({
        bookings,
        bookingsLoading,
        seedByBookingId,
        apiByBookingId: linkedGamesByBookingId,
        apiError,
        apiLoading,
        timeZoneOf,
      }),
    [apiError, apiLoading, bookings, bookingsLoading, linkedGamesByBookingId, seedByBookingId, timeZoneOf],
  );

  const visibleBookings = useMemo(
    () => resolved.bookings.filter((booking) => Boolean(booking.clubId && clubById.has(booking.clubId))),
    [clubById, resolved.bookings],
  );

  const displayLinkedGames = useMemo(() => {
    const merged = new Map(seedByBookingId);
    for (const [id, gamesForId] of linkedGamesByBookingId) {
      merged.set(id, gamesForId);
    }
    return merged;
  }, [linkedGamesByBookingId, seedByBookingId]);

  return {
    bookings: visibleBookings,
    visible: visibleBookings.length > 0,
    pending: resolved.pending,
    linkedGamesByBookingId: displayLinkedGames,
    reloadLinkedGames: reload,
  };
}
