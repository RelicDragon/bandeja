import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as matchTimerService from '../services/results/matchTimer.service';
import type { MatchTimerAction } from '../services/results/matchTimer.types';

export const getMatchTimer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;
  const snapshot = await matchTimerService.getMatchTimerSnapshotForApi(gameId, matchId);
  res.json({ success: true, data: { snapshot } });
});

function transition(action: MatchTimerAction) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    const { gameId, matchId } = req.params;
    const snapshot = await matchTimerService.transitionMatchTimer(
      gameId,
      matchId,
      req.userId!,
      req.user?.isAdmin || false,
      action
    );
    res.json({ success: true, data: { snapshot } });
  });
}

export const startMatchTimer = transition('start');
export const pauseMatchTimer = transition('pause');
export const resumeMatchTimer = transition('resume');
export const stopMatchTimer = transition('stop');
export const resetMatchTimer = transition('reset');
