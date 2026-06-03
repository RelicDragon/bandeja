import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import type { PlaytomicSportLevelInput } from '../../integrations/playtomicSport';
import { syncPlaytomicLevelsToUser } from '../../services/integrations/playtomicProfileSync.service';
import { updateSportExternalRatingHint } from '../../services/user/sportExternalRating.service';
import {
  addUserSport,
  confirmInitialSportsSetup,
  parseSportParam,
  removeUserSport,
  setUserPrimarySport,
  updateUserSportLevel,
} from '../../services/user/userSportProfile.service';

export const addSport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.body?.sport);
  const { user, suggestedQuestionnaire } = await addUserSport(req.userId!, sport);
  res.json({ success: true, data: user, suggestedQuestionnaire });
});

export const setPrimarySport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.body?.sport);
  const user = await setUserPrimarySport(req.userId!, sport);
  res.json({ success: true, data: user });
});

export const confirmPrimarySport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { sports?: unknown; primarySport?: unknown; sport?: unknown };
  const sportsRaw = body.sports;
  if (!Array.isArray(sportsRaw) || sportsRaw.length === 0) {
    throw new ApiError(400, 'At least one sport is required');
  }
  const sports = sportsRaw.map((s) => parseSportParam(s));
  const primarySport = parseSportParam(body.primarySport ?? body.sport);
  const user = await confirmInitialSportsSetup(req.userId!, sports, primarySport);
  res.json({ success: true, data: user });
});

export const updateSportProfileLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.params.sport);
  const { level } = req.body as { level: number };
  const user = await updateUserSportLevel(req.userId!, sport, level);
  res.json({ success: true, data: user });
});

export const removeSport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.params.sport);
  const user = await removeUserSport(req.userId!, sport);
  res.json({ success: true, data: user });
});

export const syncPlaytomicProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { levels?: unknown };
  const levels = body.levels;
  if (!Array.isArray(levels)) {
    throw new ApiError(400, 'levels must be an array');
  }
  const user = await syncPlaytomicLevelsToUser(req.userId!, levels as PlaytomicSportLevelInput[]);
  res.json({ success: true, data: user });
});

export const updateSportExternalRating = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.params.sport);
  const { externalRatingHint } = req.body as { externalRatingHint?: unknown };
  const user = await updateSportExternalRatingHint(req.userId!, sport, externalRatingHint ?? null);
  res.json({ success: true, data: user });
});
