import {
  computeBookingSelectionLimits,
  computeEditBookingSelectionLimits,
} from './computeBookingSelectionLimits';
import { deriveGameTimeFromBookings } from './deriveGameTimeFromBookings';

export type LinkedBookingCoverageInput = {
  bookingStart?: string | null;
  bookingEnd?: string | null;
};

export type GameBookingCoverageInput = {
  startTime: string;
  endTime: string;
  maxParticipants: number;
  playersPerMatch?: number;
  courtCount?: number;
};

export type LinkedBookingCoverageResult = {
  courtCountMet: boolean;
  timeCoverageMet: boolean;
  fullyCovered: boolean;
  requiredBookingCount: number;
};

export type EvaluateLinkedBookingCoverageOptions = {
  timeZone?: string;
};

export function evaluateLinkedBookingCoverage(
  linkedBookings: LinkedBookingCoverageInput[],
  game: GameBookingCoverageInput,
  options?: EvaluateLinkedBookingCoverageOptions,
): LinkedBookingCoverageResult {
  const playersPerMatch = game.playersPerMatch === 2 ? 2 : 4;
  const requiredBookingCount =
    game.courtCount != null && game.courtCount > 0
      ? computeEditBookingSelectionLimits(
          game.maxParticipants,
          playersPerMatch,
          game.courtCount,
        ).min
      : computeBookingSelectionLimits(game.maxParticipants, playersPerMatch).min;

  const courtCountMet = linkedBookings.length >= requiredBookingCount;

  const derived = deriveGameTimeFromBookings(linkedBookings, { timeZone: options?.timeZone });
  const timeCoverageMet =
    Boolean(derived.startTime && derived.endTime) &&
    derived.startTime! <= game.startTime &&
    derived.endTime! >= game.endTime;

  return {
    courtCountMet,
    timeCoverageMet,
    fullyCovered: courtCountMet && timeCoverageMet,
    requiredBookingCount,
  };
}

/**
 * Time change — which linked bookings need the
 * organizer's manual attention after the game's time moved.
 *
 * Read-only: nothing here moves or cancels a reservation. When the bookings
 * together still span the game ({@link evaluateLinkedBookingCoverage}'s
 * `timeCoverageMet`), none is flagged — back-to-back slots that cover the game
 * between them are fine. Otherwise every booking that does not by itself span
 * the new game window is flagged, which is exactly the set the organizer has
 * to rebook or extend with the club. Returns indexes into `linkedBookings`.
 */
export function findLinkedBookingsNeedingAttention(
  linkedBookings: LinkedBookingCoverageInput[],
  game: Pick<GameBookingCoverageInput, 'startTime' | 'endTime'>,
  options?: EvaluateLinkedBookingCoverageOptions,
): number[] {
  if (linkedBookings.length === 0) return [];
  const derived = deriveGameTimeFromBookings(linkedBookings, { timeZone: options?.timeZone });
  const spansGame =
    Boolean(derived.startTime && derived.endTime) &&
    derived.startTime! <= game.startTime &&
    derived.endTime! >= game.endTime;
  if (spansGame) return [];

  const flagged: number[] = [];
  linkedBookings.forEach((booking, index) => {
    const own = deriveGameTimeFromBookings([booking], { timeZone: options?.timeZone });
    const covers =
      Boolean(own.startTime && own.endTime) &&
      own.startTime! <= game.startTime &&
      own.endTime! >= game.endTime;
    if (!covers) flagged.push(index);
  });
  return flagged;
}
