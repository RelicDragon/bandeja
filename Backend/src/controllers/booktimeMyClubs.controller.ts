import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as booktimeMyClubsService from '../services/booktime/booktimeMyClubs.service';
import * as booktimeGameLinkService from '../services/booktime/booktimeGameLink.service';

export const getMyBooktimeClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await booktimeMyClubsService.getMyBooktimeClubs(req.userId!);
  res.json({ success: true, data });
});

export const getLinkedGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const externalBookingId = req.params.externalBookingId;
  if (typeof externalBookingId !== 'string' || !externalBookingId.trim()) {
    throw new ApiError(400, 'externalBookingId is required');
  }
  const game = await booktimeGameLinkService.findLinkedGameForUser(
    req.userId!,
    externalBookingId.trim()
  );
  res.json({ success: true, data: game });
});
