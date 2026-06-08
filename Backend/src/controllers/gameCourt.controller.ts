import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { GameCourtService } from '../services/gameCourt/gameCourt.service';
import { ApiError } from '../utils/ApiError';

export const getGameCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const gameCourts = await GameCourtService.getGameCourts(gameId);

  res.json({
    success: true,
    data: gameCourts,
  });
});

export const setGameCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { courtIds } = req.body;

  if (!Array.isArray(courtIds)) {
    throw new ApiError(400, 'courtIds must be an array');
  }

  const gameCourts = await GameCourtService.setGameCourts(gameId, courtIds);

  res.json({
    success: true,
    data: gameCourts,
  });
});

export const addGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { courtId } = req.body;

  if (!courtId) {
    throw new ApiError(400, 'courtId is required');
  }

  const gameCourt = await GameCourtService.addGameCourt(gameId, courtId);

  res.json({
    success: true,
    data: gameCourt,
  });
});

export const removeGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, gameCourtId } = req.params;
  const result = await GameCourtService.removeGameCourt(gameId, gameCourtId);

  res.json({
    success: true,
    data: result,
  });
});

export const reorderGameCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { gameCourtIds } = req.body;

  if (!Array.isArray(gameCourtIds)) {
    throw new ApiError(400, 'gameCourtIds must be an array');
  }

  const gameCourts = await GameCourtService.reorderGameCourts(gameId, gameCourtIds);

  res.json({
    success: true,
    data: gameCourts,
  });
});

