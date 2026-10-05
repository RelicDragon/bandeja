/**
 * PRD 358 — novice mode. Routes: `Backend/src/routes/novice.routes.ts`
 * (mounted at `/api/users`, paths under `/me/novice`).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  getNoviceState,
  markNoviceMilestoneSeen,
  unlockAllNoviceFeatures,
  type NoviceState,
} from '../services/novice/noviceProgress.service';

function requireUserId(req: AuthRequest): string {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'errors.unauthorized');
  return userId;
}

function requireState(state: NoviceState | null): NoviceState {
  if (!state) throw new ApiError(404, 'User not found');
  return state;
}

export const getNovice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const state = requireState(await getNoviceState(requireUserId(req)));
  res.json({ success: true, data: state });
});

export const postNoviceUnlockAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const state = requireState(await unlockAllNoviceFeatures(requireUserId(req)));
  res.json({ success: true, data: state });
});

export const postNoviceMilestoneSeen = asyncHandler(async (req: AuthRequest, res: Response) => {
  const rank = Number((req.body as { rank?: unknown } | undefined)?.rank);
  const state = requireState(await markNoviceMilestoneSeen(requireUserId(req), rank));
  res.json({ success: true, data: state });
});
