import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as booktimeMyClubsService from '../services/booktime/booktimeMyClubs.service';
import * as booktimeConnectHintService from '../services/booktime/booktimeConnectHint.service';
import * as booktimeGameLinkService from '../services/booktime/booktimeGameLink.service';

export const getMyBooktimeClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await booktimeMyClubsService.getMyBooktimeClubs(req.userId!);
  res.json({ success: true, data });
});

export const dismissConnectHint = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await booktimeConnectHintService.dismissBooktimeConnectHint(req.userId!);
  res.json({ success: true, data: user });
});

export const getLinkedGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const externalBookingId = req.params.externalBookingId;
  if (typeof externalBookingId !== 'string' || !externalBookingId.trim()) {
    throw new ApiError(400, 'externalBookingId is required');
  }
  const games = await booktimeGameLinkService.findLinkedGamesForBooking(externalBookingId.trim());
  res.json({ success: true, data: games });
});
