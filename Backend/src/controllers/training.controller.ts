import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as trainingService from '../services/training.service';

export const finishTraining = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId!;

  await trainingService.finishTraining(gameId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, userId);
  }

  res.json({
    success: true,
    message: 'Training finished successfully',
  });
});

export const updateParticipantLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, userId: participantUserId } = req.params;
  const { level, reliability } = req.body;
  const userId = req.userId!;

  await trainingService.updateParticipantLevel(gameId, userId, participantUserId, level, reliability);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, userId);
  }

  res.json({
    success: true,
    message: 'Participant level updated successfully',
  });
});

export const undoTraining = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId!;

  await trainingService.undoTraining(gameId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, userId);
  }

  res.json({
    success: true,
    message: 'Training changes undone successfully',
  });
});
