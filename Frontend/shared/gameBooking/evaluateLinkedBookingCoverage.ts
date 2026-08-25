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
