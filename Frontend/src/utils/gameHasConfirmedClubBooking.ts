import type { Game } from '@/types';
import {
  gameBookingStatusToBadgeKind,
  type GameBookingStatus,
} from '@shared/gameBooking/computeGameBookingStatus';
import {
  evaluateLinkedBookingCoverage,
  type LinkedBookingCoverageResult,
} from '@shared/gameBooking/evaluateLinkedBookingCoverage';
import { playersPerMatchOf } from '@/utils/matchFormat';

export type GameBookingBadgeKind = 'none' | 'manual' | 'external_partial' | 'external_full';

export function gameHasConfirmedClubBooking(game: Game): boolean {
  if (game.timeIsSet !== true || game.hasBookedCourt !== true) return false;
  const hasCourt = Boolean(game.courtId || game.court);
  const hasClub = Boolean(game.clubId || game.club || game.court?.club);
  return hasCourt && hasClub;
}

export function gameHasLinkedExternalBooking(game: Game): boolean {
  return (
    game.bookingStatus === 'EXTERNAL_PARTIAL' ||
    game.bookingStatus === 'EXTERNAL_FULL' ||
    (game.linkedBookings?.length ?? 0) > 0
  );
}

export function evaluateGameLinkedBookingCoverage(game: Game): LinkedBookingCoverageResult | null {
  const club = game.court?.club ?? game.club;
  const links = game.linkedBookings ?? [];
  if (links.length === 0) return null;

  return evaluateLinkedBookingCoverage(
    links,
    {
      startTime: game.startTime,
      endTime: game.endTime,
      maxParticipants: game.maxParticipants,
      playersPerMatch: playersPerMatchOf(game),
    },
    { timeZone: club?.city?.timezone ?? game.city?.timezone ?? undefined },
  );
}

export function resolveGameBookingBadgeKind(game: Game): GameBookingBadgeKind {
  if (game.bookingStatus) {
    return gameBookingStatusToBadgeKind(game.bookingStatus as GameBookingStatus);
  }

  const coverage = evaluateGameLinkedBookingCoverage(game);
  if (coverage) {
    return coverage.fullyCovered ? 'external_full' : 'external_partial';
  }
  if (gameHasConfirmedClubBooking(game)) return 'manual';
  return 'none';
}

export function isExternallyFullyBookedGame(game: Game): boolean {
  return resolveGameBookingBadgeKind(game) === 'external_full';
}

export function isLinkedBookingFullyCovered(game: Game): boolean {
  if (game.bookingStatus === 'EXTERNAL_FULL') return true;
  if (game.bookingStatus === 'EXTERNAL_PARTIAL') return false;
  return evaluateGameLinkedBookingCoverage(game)?.fullyCovered ?? false;
}
