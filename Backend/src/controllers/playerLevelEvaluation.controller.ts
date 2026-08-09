import { Response } from 'express';
import { PlayerLevelVerdict } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getGameLevelEvaluations,
  upsertGameLevelEvaluation,
} from '../services/playerLevelEvaluation.service';

export const getForGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await getGameLevelEvaluations(req.params.gameId, req.userId!);
  res.json({ success: true, data });
});

export const upsertForGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await upsertGameLevelEvaluation(
    req.params.gameId,
    req.userId!,
    req.params.targetUserId,
    req.body.verdict as PlayerLevelVerdict,
  );
  res.json({ success: true, data });
});
