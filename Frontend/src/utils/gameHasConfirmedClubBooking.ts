import type { Game } from '@/types';
import { findLinkedBookingsNeedingAttention } from '@shared/gameBooking/evaluateLinkedBookingCoverage';

/**
 * Linked provider bookings — behavior helpers only (delete warnings, time-change
 * flags). Display of reservation state goes through `utils/courtReservationView`.
 */
export function gameHasLinkedExternalBooking(game: Game): boolean {
  return (
    game.bookingStatus === 'EXTERNAL_PARTIAL' ||
    game.bookingStatus === 'EXTERNAL_FULL' ||
    (game.linkedBookings?.length ?? 0) > 0
  );
}

/**
 * Time change — ids of linked bookings that no longer cover the game's time
 * (e.g. the organizer moved the game but kept the reservation). Read-only: the
 * app flags them for manual attention and never moves or cancels a booking.
 */
export function gameLinkedBookingIdsNeedingAttention(game: Game): Set<string> {
  const links = game.linkedBookings ?? [];
  if (links.length === 0 || game.timeIsSet !== true) return new Set();
  const club = game.court?.club ?? game.club;
  const flagged = findLinkedBookingsNeedingAttention(
    links,
    { startTime: game.startTime, endTime: game.endTime },
    { timeZone: club?.city?.timezone ?? game.city?.timezone ?? undefined },
  );
  return new Set(flagged.map((index) => links[index].id));
}
