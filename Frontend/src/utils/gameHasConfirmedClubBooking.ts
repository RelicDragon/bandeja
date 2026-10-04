import type { Game } from '@/types';
import {
  gameBookingStatusToBadgeKind,
  type GameBookingStatus,
} from '@shared/gameBooking/computeGameBookingStatus';
import {
  evaluateLinkedBookingCoverage,
  findLinkedBookingsNeedingAttention,
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
      courtCount: game.gameCourts?.length ?? (game.courtId || game.court ? 1 : 0),
    },
    { timeZone: club?.city?.timezone ?? game.city?.timezone ?? undefined },
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
