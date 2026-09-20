import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { LIVE_RAIL_WHERE } from '../game/availableGamesStructuralWhere';

/**
 * PRD 349 — the live gate, re-applied at **redemption**.
 *
 * `POST /live-games/:id/spectator-token` mints only for a public, live,
 * rail-visible game, but the token lives 48 h. Without this check a token
 * minted while the game was public keeps streaming the full results payload
 * after the organizer flips the game private, switches "Show on Live now" off
 * or finishes it — i.e. the opt-out is unenforceable once anyone has minted.
 *
 * Answers the same 404 as a game that does not exist, so redemption cannot be
 * used to probe which of the three conditions failed.
 */
export async function assertSpectatorGameStillWatchable(gameId: string): Promise<void> {
  const watchable = await prisma.game.findFirst({
    where: { id: gameId, ...LIVE_RAIL_WHERE },
    select: { id: true },
  });
  if (!watchable) {
    throw new ApiError(404, 'errors.live.notWatchable');
  }
}

export async function assertMatchBelongsToGame(gameId: string, matchId: string): Promise<void> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, round: { select: { gameId: true } } },
  });
  if (!m) {
    throw new ApiError(404, 'Match not found');
  }
  if (m.round.gameId !== gameId) {
    throw new ApiError(400, 'Match does not belong to the specified game');
  }
}
