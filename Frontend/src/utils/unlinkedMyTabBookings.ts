import type { BooktimeLinkedGame } from '@/api/booktime';
import type { Game } from '@/types';
import {
  filterBookingsNotFullyLinked,
  linkedGamesFullyCoverBookingSlot,
  type LinkBookingRecord,
} from '@/services/gameBooking/linkBookingToGame';

export function seedLinkedGamesFromMyGames(
  games: Array<Pick<Game, 'id' | 'name' | 'startTime' | 'endTime' | 'timeIsSet' | 'status' | 'linkedBookings'>>,
): Map<string, BooktimeLinkedGame[]> {
  const map = new Map<string, BooktimeLinkedGame[]>();
  for (const game of games) {
    for (const link of game.linkedBookings ?? []) {
      const list = map.get(link.externalBookingId) ?? [];
      list.push({
        id: game.id,
        name: game.name ?? null,
        startTime: game.startTime,
        endTime: game.endTime ?? '',
        timeIsSet: game.timeIsSet !== false,
        status: game.status,
        linkBookingStart: link.bookingStart ?? null,
        linkBookingEnd: link.bookingEnd ?? null,
      });
      map.set(link.externalBookingId, list);
    }
  }
  return map;
}

export function resolveUnlinkedMyTabBookings<T extends LinkBookingRecord>(input: {
  bookings: T[];
  bookingsLoading: boolean;
  seedByBookingId: { get(bookingId: string): BooktimeLinkedGame[] | undefined };
  apiByBookingId: { get(bookingId: string): BooktimeLinkedGame[] | undefined };
  apiError: boolean;
  apiLoading: boolean;
  timeZoneOf: (booking: T) => string | null | undefined;
}): { bookings: T[]; visible: boolean; pending: boolean } {
  const { bookings, bookingsLoading, seedByBookingId, apiByBookingId, apiError, apiLoading, timeZoneOf } =
    input;

  if (bookings.length === 0) {
    return { bookings: [], visible: false, pending: bookingsLoading };
  }

  const seedFullyLinked = new Set(
    bookings
      .filter((booking) =>
        linkedGamesFullyCoverBookingSlot(
          booking,
          seedByBookingId.get(booking.uuid) ?? [],
          timeZoneOf(booking),
        ),
      )
      .map((booking) => booking.uuid),
  );

  const waitingForApi = bookings.some(
    (booking) => !seedFullyLinked.has(booking.uuid) && apiByBookingId.get(booking.uuid) === undefined,
  );
  const pending = waitingForApi && (apiLoading || !apiError);

  const unlinked = filterBookingsNotFullyLinked(
    bookings.filter(
      (booking) => !seedFullyLinked.has(booking.uuid) && apiByBookingId.get(booking.uuid) !== undefined,
    ),
    apiByBookingId,
    timeZoneOf,
  );

  return {
    bookings: unlinked,
    visible: unlinked.length > 0,
    pending,
  };
}
