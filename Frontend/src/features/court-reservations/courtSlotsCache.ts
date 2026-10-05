/**
 * Apply a court-slot write's response to the game at once (no wait for the
 * follow-up `GET /games/:id`): the card re-derives from `gameCourts` +
 * `linkedBookings`, so these are what each response patches.
 *
 *  - `PUT /games/:id/court-slots` → the whole slot view;
 *  - `POST /games/:id/link-booking`, `PATCH /games/:id/bookings` → the
 *    game's full link list;
 *  - `POST …/accept-upstream` → links + (for `move_game`) the new time.
 *
 * The caller still refreshes in the background; anything not in the response
 * (e.g. `game.court`) catches up then.
 */
import type { Game } from '@/types';
import type { CourtSlotsView } from '@/api/courtSlots';
import type { LinkedBookingPayload } from './courtReservationsInput';

export type CourtSlotsWriteResult =
  | { kind: 'slots'; view: CourtSlotsView }
  | { kind: 'links'; links: LinkedBookingPayload[] }
  | { kind: 'none' };

/** `POST /games/:id/bookings/:linkId/accept-upstream` response. */
export type AcceptUpstreamResult = {
  startTime?: string | null;
  endTime?: string | null;
  bookingStatus?: Game['bookingStatus'] | null;
  hasBookedCourt?: boolean | null;
  linkedBookings?: LinkedBookingPayload[];
};

export function mergeCourtSlotsViewIntoGame(game: Game, view: CourtSlotsView): Game {
  return {
    ...game,
    ...(view.courtId !== undefined ? { courtId: view.courtId ?? undefined } : {}),
    hasBookedCourt: view.hasBookedCourt,
    bookingStatus: view.bookingStatus,
    reportedAnyCourtCount: view.reportedAnyCourtCount,
    ...(view.courtSlotCount !== undefined ? { courtSlotCount: view.courtSlotCount } : {}),
    gameCourts: view.gameCourts as unknown as Game['gameCourts'],
    linkedBookings: view.linkedBookings as unknown as Game['linkedBookings'],
  };
}

export function mergeLinkedBookingsIntoGame(game: Game, links: readonly LinkedBookingPayload[]): Game {
  return { ...game, linkedBookings: links as unknown as Game['linkedBookings'] };
}

export function mergeAcceptUpstreamIntoGame(game: Game, result: AcceptUpstreamResult | null | undefined): Game {
  if (!result) return game;
  return {
    ...game,
    ...(result.startTime ? { startTime: result.startTime } : {}),
    ...(result.endTime ? { endTime: result.endTime } : {}),
    ...(result.bookingStatus ? { bookingStatus: result.bookingStatus } : {}),
    ...(result.hasBookedCourt != null ? { hasBookedCourt: result.hasBookedCourt } : {}),
    ...(result.linkedBookings ? { linkedBookings: result.linkedBookings as unknown as Game['linkedBookings'] } : {}),
  };
}

/** The game after a court-slot write, or `null` when the response carries nothing to apply. */
export function applyCourtSlotsWrite(game: Game, result: CourtSlotsWriteResult): Game | null {
  if (result.kind === 'slots') return mergeCourtSlotsViewIntoGame(game, result.view);
  if (result.kind === 'links') return mergeLinkedBookingsIntoGame(game, result.links);
  return null;
}
