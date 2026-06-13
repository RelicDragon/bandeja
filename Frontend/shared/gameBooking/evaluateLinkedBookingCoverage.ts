import { computeBookingSelectionLimits } from './computeBookingSelectionLimits';
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
};

export type LinkedBookingCoverageResult = {
  courtCountMet: boolean;
  timeCoverageMet: boolean;
  fullyCovered: boolean;
  requiredBookingCount: number;
};

export function evaluateLinkedBookingCoverage(
  linkedBookings: LinkedBookingCoverageInput[],
  game: GameBookingCoverageInput,
): LinkedBookingCoverageResult {
  const playersPerMatch = game.playersPerMatch === 2 ? 2 : 4;
  const { min: requiredBookingCount } = computeBookingSelectionLimits(
    game.maxParticipants,
    playersPerMatch,
  );

  const courtCountMet = linkedBookings.length >= requiredBookingCount;

  const derived = deriveGameTimeFromBookings(linkedBookings);
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
