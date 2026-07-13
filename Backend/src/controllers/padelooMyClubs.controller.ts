import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as padelooMyClubsService from '../services/padeloo/padelooMyClubs.service';
import * as booktimeGameLinkService from '../services/booktime/booktimeGameLink.service';

export const getMyPadelooClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = await padelooMyClubsService.getMyPadelooClubs(req.userId!);
  res.json({ success: true, data: payload });
});

export const getLinkedGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { externalBookingId } = req.params;
  const games = await booktimeGameLinkService.findLinkedGamesForBooking(externalBookingId.trim());
  res.json({ success: true, data: games });
});
