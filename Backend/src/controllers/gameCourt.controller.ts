import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { GameCourtService } from '../services/gameCourt/gameCourt.service';

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
    return res.status(400).json({
      success: false,
      message: 'courtIds must be an array',
    });
  }

  const gameCourts = await GameCourtService.setGameCourts(gameId, courtIds, req.userId!);

  res.json({
    success: true,
    data: gameCourts,
  });
});

export const addGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { courtId } = req.body;

  if (!courtId) {
    return res.status(400).json({
      success: false,
      message: 'courtId is required',
    });
  }

  const gameCourt = await GameCourtService.addGameCourt(gameId, courtId, req.userId!);

  res.json({
    success: true,
    data: gameCourt,
  });
});

export const removeGameCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, gameCourtId } = req.params;
  const result = await GameCourtService.removeGameCourt(gameId, gameCourtId, req.userId!);

  res.json({
    success: true,
    data: result,
  });
});

export const reorderGameCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { gameCourtIds } = req.body;

  if (!Array.isArray(gameCourtIds)) {
    return res.status(400).json({
      success: false,
      message: 'gameCourtIds must be an array',
    });
  }

  const gameCourts = await GameCourtService.reorderGameCourts(gameId, gameCourtIds, req.userId!);

  res.json({
    success: true,
    data: gameCourts,
  });
});

