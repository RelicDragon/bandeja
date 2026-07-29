import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { PlayIntentService } from '../services/playIntent/playIntent.service';
import { PlayIntentMatchService } from '../services/playIntent/playIntentMatch.service';
import { MatchProposalService } from '../services/playIntent/matchProposal.service';
import { parseSport } from '../sport/sportIds';
import prisma from '../config/database';

export const getMyPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const cityId = typeof req.query.cityId === 'string' ? req.query.cityId : undefined;
  const sport = typeof req.query.sport === 'string' ? parseSport(req.query.sport) : undefined;
  const intent = await PlayIntentService.getMyActiveIntent(req.userId, cityId, sport);
  res.json({ success: true, data: intent });
});

export const createPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const intent = await PlayIntentService.createOrReplace(req.userId, req.body);
  res.status(201).json({ success: true, data: intent });
});

export const cancelPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const intentId = typeof req.params.id === 'string' ? req.params.id : undefined;
  const result = await PlayIntentService.cancel(req.userId, intentId === 'me' ? undefined : intentId);
  res.json({ success: true, data: result });
});

export const getPlayIntentPool = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');

  let cityId = typeof req.query.cityId === 'string' ? req.query.cityId : undefined;
  if (!cityId) {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { currentCityId: true, primarySport: true },
    });
    cityId = user?.currentCityId ?? undefined;
  }
  if (!cityId) throw new ApiError(400, 'City is required');

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { primarySport: true },
  });
  const sport = parseSport(
    typeof req.query.sport === 'string' ? req.query.sport : user?.primarySport,
  );

  const pool = await PlayIntentMatchService.getPoolForViewer(req.userId, cityId, sport);
  res.json({ success: true, data: pool });
});

export const getMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const proposal = await MatchProposalService.getById(req.params.id, req.userId);
  res.json({ success: true, data: proposal });
});

export const confirmMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const result = await MatchProposalService.confirm(req.params.id, req.userId);
  res.json({ success: true, data: result });
});

export const declineMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const result = await MatchProposalService.decline(req.params.id, req.userId);
  res.json({ success: true, data: result });
});

export const convertMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const gameId = req.body?.gameId;
  if (!gameId || typeof gameId !== 'string') throw new ApiError(400, 'gameId is required');
  const result = await MatchProposalService.markConverted(req.params.id, req.userId, gameId);
  res.json({ success: true, data: result });
});

export const releaseMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const result = await MatchProposalService.releaseHost(req.params.id, req.userId);
  res.json({ success: true, data: result });
});

export const removeMatchProposalMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
  if (!userId) throw new ApiError(400, 'userId is required');
  const result = await MatchProposalService.removeMember(req.params.id, req.userId, userId);
  res.json({ success: true, data: result });
});

export const addMatchProposalMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
  const intentId = typeof req.body?.intentId === 'string' ? req.body.intentId : undefined;
  if (!userId || !intentId) throw new ApiError(400, 'userId and intentId are required');
  const result = await MatchProposalService.addMember(req.params.id, req.userId, { userId, intentId });
  res.json({ success: true, data: result });
});
