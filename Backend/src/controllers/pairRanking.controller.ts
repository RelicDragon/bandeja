/**
 * PRD 352 — pair leaderboard endpoints.
 *
 * `GET /rankings/pairs` mirrors `/rankings/user-context`'s conventions (filters
 * default to the viewer's own city and sport, the response carries a `me`
 * block) but is cursor-paginated: the pair table is quadratic in players and
 * must never be returned whole.
 */

import type { Response } from 'express';
import { Sport } from '@prisma/client';
import prisma from '../config/database';
import type { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePairParam } from '../services/pairStat/pairKey';
import {
  parsePairPeriod,
  parsePairSort,
} from '../services/pairStat/pairRankingOrder';
import {
  PAIR_PAGE_SIZE,
  getPairDetail,
  getPairLeaderboard,
  getUserPartners,
} from '../services/pairStat/pairRanking.service';
import { rebuildPairStats } from '../services/pairStat/pairStat.service';

function parseSport(raw: unknown, fallback: Sport | null): Sport {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if (upper in Sport) return Sport[upper as keyof typeof Sport];
  }
  return fallback ?? Sport.PADEL;
}

function parseLimit(raw: unknown): number {
  if (typeof raw !== 'string') return PAIR_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : PAIR_PAGE_SIZE;
}

async function resolveViewerDefaults(userId: string): Promise<{
  currentCityId: string | null;
  primarySport: Sport | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true, primarySport: true },
  });
  if (!user) throw new ApiError(404, 'errors.users.notFound');
  return { currentCityId: user.currentCityId, primarySport: user.primarySport };
}

export const getPairLeaderboardHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const viewerId = req.userId!;
    const defaults = await resolveViewerDefaults(viewerId);

    const cityId =
      typeof req.query.cityId === 'string' && req.query.cityId.trim().length > 0
        ? req.query.cityId.trim()
        : defaults.currentCityId;
    if (!cityId) throw new ApiError(400, 'errors.pairs.cityRequired');

    const result = await getPairLeaderboard({
      viewerId,
      cityId,
      sport: parseSport(req.query.sport, defaults.primarySport),
      period: parsePairPeriod(req.query.period),
      sort: parsePairSort(req.query.sort),
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: parseLimit(req.query.limit),
    });

    res.json({ success: true, data: result });
  },
);

export const getPairDetailHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const viewerId = req.userId!;
  const ids = parsePairParam(req.params.pairId);
  if (!ids) throw new ApiError(400, 'errors.pairs.invalidPair');

  const defaults = await resolveViewerDefaults(viewerId);
  const detail = await getPairDetail(
    ids,
    parseSport(req.query.sport, defaults.primarySport),
    viewerId,
  );

  res.json({ success: true, data: detail });
});

export const getUserPartnersHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const targetId = req.params.userId;
  if (!targetId) throw new ApiError(400, 'errors.pairs.invalidPair');

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { primarySport: true },
  });
  if (!target) throw new ApiError(404, 'errors.users.notFound');

  const partners = await getUserPartners(targetId, parseSport(req.query.sport, target.primarySport));
  res.json({ success: true, data: { partners } });
});

/**
 * Admin rebuild. Runs in batches and is safe to re-run; it is the repair path
 * for any pair row the post-commit refresh failed to update.
 */
export const recalculatePairStatsHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const body = (req.body ?? {}) as { sport?: unknown; cityId?: unknown };
    const sport = typeof body.sport === 'string' ? parseSport(body.sport, null) : undefined;
    const cityId =
      typeof body.cityId === 'string' && body.cityId.trim().length > 0
        ? body.cityId.trim()
        : undefined;

    const result = await rebuildPairStats({ sport, cityId });
    res.json({ success: true, data: result });
  },
);
