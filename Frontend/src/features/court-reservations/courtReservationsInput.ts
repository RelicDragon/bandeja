/**
 * Payload types this feature reads beyond `Game`, and the game → slots entry
 * point.
 *
 * The payload → `deriveCourtReservations` mapping (old payloads, find cards
 * without links, sport-based `playersPerMatch`, synthetic `legacy:` slots)
 * has ONE implementation: `buildCourtReservationsInput` in
 * `@/utils/courtReservationView`. This module only delegates.
 */
import {
  deriveCourtReservations,
  type CourtReservationsResult,
  type CourtSlotReservation,
} from '@shared/gameBooking/courtReservations';
import { buildCourtReservationsInput, type CourtReservationGame } from '@/utils/courtReservationView';

/** Prefix of a slot id the backend does not know (legacy fallback). Never sent as `gameCourtId`. */
export const SYNTHETIC_GAME_COURT_PREFIX = 'legacy:';

export type UpstreamState = 'OK' | 'MOVED' | 'MISSING' | 'UNKNOWN';

export type GameCourtPayload = {
  id: string;
  courtId: string;
  order: number;
  reservation?: CourtSlotReservation | null;
  reportedById?: string | null;
  reportedAt?: string | null;
};

export type LinkedBookingPayload = {
  id: string;
  externalBookingId: string;
  externalBookingProvider: string;
  courtId?: string | null;
  bookingStart?: string | null;
  bookingEnd?: string | null;
  gameCourtId?: string | null;
  /** Last upstream check (drift): the club's copy moved or disappeared. */
  upstreamState?: UpstreamState | null;
  upstreamStart?: string | null;
  upstreamEnd?: string | null;
};

export function isSyntheticGameCourtId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(SYNTHETIC_GAME_COURT_PREFIX);
}

/** Game payload → per-slot view (delegates the mapping to `buildCourtReservationsInput`). */
export function deriveGameCourtReservations(game: CourtReservationGame): CourtReservationsResult {
  return deriveCourtReservations(buildCourtReservationsInput(game));
}
