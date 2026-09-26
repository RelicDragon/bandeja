/**
 * PRD 349 — "Live now" rail endpoints.
 *
 * Every handler goes through `liveGames.service.ts`, which owns the privacy
 * gate (public or a public season's fixture, + `showOnLiveRail`; IN_PROGRESS
 * for anything watchable). Nothing here re-implements it.
 */
import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { signLiveSpectatorToken } from '../utils/jwt';
import { findLiveRailGame, listCityRailGames } from '../services/game/liveGames.service';
import { clampLiveRailLimit } from '../services/game/liveRailOrder';

/**
 * `GET /api/live/games?cityId=&limit=`
 *
 * Live games, then games that went final today in the city. Defaults to the
 * viewer's current city. Returns `[]` rather than 404 when the city has
 * nothing to show — the rail hides itself on an empty list.
 */
export const getLiveGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const requestedCityId = typeof req.query.cityId === 'string' ? req.query.cityId : '';

  let cityId = requestedCityId;
  if (!cityId && req.userId) {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { currentCityId: true },
    });
    cityId = user?.currentCityId ?? '';
  }

  if (!cityId) {
    res.json({ success: true, data: { games: [] } });
    return;
  }

  const games = await listCityRailGames({
    cityId,
    viewerUserId: req.userId ?? null,
    limit: clampLiveRailLimit(req.query.limit),
  });

  res.json({ success: true, data: { games } });
});

/**
 * `GET /api/live/games/:id`
 *
 * One watchable game, or 404. Used by the game-details **Live** block, which
 * only knows the game is in progress — the score summary is not part of the
 * game-detail payload.
 */
export const getLiveGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const game = await findLiveRailGame(req.params.id);
  if (!game) {
    throw new ApiError(404, 'errors.live.notWatchable');
  }
  res.json({ success: true, data: { game } });
});

/**
 * `POST /api/live/games/:id/spectator-token`
 *
 * Mints the **existing** public broadcast token, but only for a game the rail
 * would have shown. Deliberately narrow: it never widens
 * `POST /results/game/:gameId/matches/:matchId/live-spectator-token`, which
 * stays organizer-only (`requireCanModifyResults`) for arbitrary matches.
 *
 * A private, finished or opted-out game answers the same 404 as a game that
 * does not exist, so the endpoint cannot be used to probe game visibility.
 */
export const postLiveSpectatorToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: gameId } = req.params;

  const game = await findLiveRailGame(gameId);
  if (!game) {
    throw new ApiError(404, 'errors.live.notWatchable');
  }

  const matchId = game.liveSummary.matchId;
  const token = signLiveSpectatorToken(gameId, matchId);

  res.json({ success: true, data: { token, matchId, gameId } });
});
