/**
 * `Game.courtBookingMode` (docs/domains/booking.md "Game only"): `GAME_ONLY` = the organizer
 * handles the court themselves; the club's schedule is never checked and the game is never
 * blocked. Links win: a linked external booking flips the game back to `CLUB`
 * (`syncGameBookingState`). Old clients never send the field.
 */
import { CourtBookingMode, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

export const GAME_ONLY_HAS_LINKS_KEY = 'gameDetails.courts.gameOnlyHasLinks';

/** `undefined` when absent; throws 400 for anything but `CLUB` / `GAME_ONLY`. */
export function parseCourtBookingMode(data: Record<string, unknown>): CourtBookingMode | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, 'courtBookingMode')) return undefined;
  const value = data.courtBookingMode;
  if (value === undefined) return undefined;
  if (value === CourtBookingMode.CLUB || value === CourtBookingMode.GAME_ONLY) return value;
  throw new ApiError(400, 'courtBookingMode must be CLUB or GAME_ONLY');
}

/** Explicit `GAME_ONLY` while the game has linked bookings → 400 (unlink first). */
export async function assertGameOnlyWithoutLinksInTx(tx: Prisma.TransactionClient, gameId: string): Promise<void> {
  const links = await tx.gameExternalBooking.count({ where: { gameId } });
  if (links > 0) throw new ApiError(400, GAME_ONLY_HAS_LINKS_KEY);
}
