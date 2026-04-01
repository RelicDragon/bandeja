import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import { GameWorkoutService } from '../../services/game/gameWorkout.service';

export const getMyWorkoutSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const rawLimit = parseInt(String(req.query.limit ?? '30'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

  let from: Date | undefined;
  let to: Date | undefined;
  if (req.query.from && typeof req.query.from === 'string') {
    const d = new Date(req.query.from);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (req.query.to && typeof req.query.to === 'string') {
    const d = new Date(req.query.to);
    if (!Number.isNaN(d.getTime())) to = d;
  }

  const rows = await GameWorkoutService.listForUser(req.userId, { limit, from, to });
  res.json({ success: true, data: rows });
});
