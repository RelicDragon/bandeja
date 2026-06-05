import { Response } from 'express';
import { Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import {
  queryUserHistory,
  queryUserHistorySummary,
  queryGameHistory,
} from '../services/levelChange';

function parseSportQuery(value: unknown): Sport | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const upper = value.trim().toUpperCase();
  if (Object.values(Sport).includes(upper as Sport)) {
    return upper as Sport;
  }
  return undefined;
}

export const getUserLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const sport = parseSportQuery(req.query.sport);
  const result = await queryUserHistory(userId, sport);

  res.json({
    success: true,
    data: result,
  });
});

export const getUserLevelChangesByUserId = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const sport = parseSportQuery(req.query.sport);
  const result = await queryUserHistorySummary(userId, { limit, sport });

  res.json({
    success: true,
    data: result,
  });
});

export const getGameLevelChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const result = await queryGameHistory(gameId);

  res.json({
    success: true,
    data: result,
  });
});
