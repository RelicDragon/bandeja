import { evaluateLinkedBookingCoverage, type LinkedBookingCoverageInput } from './evaluateLinkedBookingCoverage';

export type GameBookingStatus =
  | 'NONE'
  | 'MANUAL'
  | 'EXTERNAL_PARTIAL'
  | 'EXTERNAL_FULL';

export type ComputeGameBookingStatusInput = {
  linkedBookings: LinkedBookingCoverageInput[];
  hasBookedCourt: boolean;
  timeIsSet: boolean;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  playersPerMatch: number;
  courtId?: string | null;
  clubId?: string | null;
  timeZone?: string;
};

export function computeGameBookingStatus(input: ComputeGameBookingStatusInput): GameBookingStatus {
  if (input.linkedBookings.length > 0) {
    const coverage = evaluateLinkedBookingCoverage(
      input.linkedBookings,
      {
        startTime: input.startTime,
        endTime: input.endTime,
        maxParticipants: input.maxParticipants,
        playersPerMatch: input.playersPerMatch,
      },
      { timeZone: input.timeZone },
    );
    return coverage.fullyCovered ? 'EXTERNAL_FULL' : 'EXTERNAL_PARTIAL';
  }

  if (input.hasBookedCourt) {
    return 'MANUAL';
  }

  return 'NONE';
}

export function gameBookingStatusToBadgeKind(
  status: GameBookingStatus | undefined | null,
): 'none' | 'manual' | 'external_partial' | 'external_full' {
  switch (status) {
    case 'MANUAL':
      return 'manual';
    case 'EXTERNAL_PARTIAL':
      return 'external_partial';
    case 'EXTERNAL_FULL':
      return 'external_full';
    default:
      return 'none';
  }
}
