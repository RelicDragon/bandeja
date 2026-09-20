/**
 * PRD 354 — public club page endpoints.
 *
 * Every handler here runs under `optionalAuth` and must be safe for a signed-out
 * reader. The club payload comes from `projectPublicClub` and nothing else —
 * see `services/clubPublic/clubPublic.projection.ts` for why.
 */
import { Response } from 'express';
import type { Sport } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { getPublicClub } from '../services/clubPublic/clubPublic.service';
import {
  getClubRegulars,
  CLUB_REGULARS_LIMIT,
} from '../services/clubPublic/clubPublicRegulars.service';
import {
  getClubPublicGames,
  CLUB_PUBLIC_GAMES_LIMIT,
} from '../services/clubPublic/clubPublicGames.service';
import { getClubTodayAvailability } from '../services/clubPublic/clubPublicToday.service';
import prisma from '../config/database';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function requireClubId(req: AuthRequest): string {
  const id = String(req.params.id ?? '');
  if (!ID_PATTERN.test(id)) {
    throw new ApiError(400, 'errors.clubs.invalidId', true, { code: 'clubs.invalidId' });
  }
  return id;
}

export const getPublicClubPage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = requireClubId(req);
  const data = await getPublicClub(clubId, { userId: req.userId ?? null });
  res.json({ success: true, data });
});

export const getPublicClubRegulars = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = requireClubId(req);
  const data = await getClubRegulars(clubId, req.userId ?? null);
  res.json({ success: true, data, meta: { limit: CLUB_REGULARS_LIMIT } });
});

export const getPublicClubGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = requireClubId(req);
  const club = await prisma.club.findFirst({
    where: { id: clubId, isActive: true },
    select: { id: true, cityId: true },
  });
  if (!club) {
    throw new ApiError(404, 'errors.clubs.notFound', true, { code: 'clubs.notFound' });
  }

  // `AuthRequest.user` is typed `any` for legacy reasons — narrow it here rather
  // than letting `any` leak into the service signature.
  const viewer = req.user as { primarySport?: Sport; isAdmin?: boolean } | undefined;
  const { games, hasMore } = await getClubPublicGames(club, {
    userId: req.userId ?? null,
    primarySport: viewer?.primarySport ?? null,
    isAdmin: viewer?.isAdmin ?? false,
  });

  res.json({
    success: true,
    data: games,
    meta: { hasMore, limit: CLUB_PUBLIC_GAMES_LIMIT },
    serverTime: new Date().toISOString(),
  });
});

export const getPublicClubToday = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = requireClubId(req);
  const data = await getClubTodayAvailability(clubId);
  res.json({ success: true, data });
});
