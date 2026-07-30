import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { PlayIntentService } from '../services/playIntent/playIntent.service';
import { PlayIntentMatchService } from '../services/playIntent/playIntentMatch.service';
import { MatchProposalService } from '../services/playIntent/matchProposal.service';
import { PlayIntentShareService } from '../services/playIntent/playIntentShare.service';
import { parseSport } from '../sport/sportIds';
import prisma from '../config/database';
import { getValidatedRequestPart } from '../middleware/validateZod';
import type {
  ValidatedAddProposalMemberInput,
  ValidatedCreatePlayIntentInput,
  ValidatedPlayIntentIdParams,
  ValidatedPlayIntentScopeQuery,
  ValidatedProposalIdParams,
  ValidatedRemoveProposalMemberInput,
} from '../services/playIntent/playIntent.schemas';

export const getMyPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const query = getValidatedRequestPart<ValidatedPlayIntentScopeQuery>(
    req,
    'query',
  );
  const intent = await PlayIntentService.getMyActiveIntent(
    req.userId,
    query.cityId,
    query.sport,
  );
  res.json({ success: true, data: intent });
});

export const createPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const body = getValidatedRequestPart<ValidatedCreatePlayIntentInput>(
    req,
    'body',
  );
  const intent = await PlayIntentService.createOrReplace(req.userId, body);
  res.status(201).json({ success: true, data: intent });
});

export const cancelPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const intentId = typeof req.params.id === 'string' ? req.params.id : undefined;
  const result = await PlayIntentService.cancel(req.userId, intentId === 'me' ? undefined : intentId);
  res.json({ success: true, data: result });
});

export const getSharedPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedPlayIntentIdParams>(
    req,
    'params',
  );
  const intent = await PlayIntentShareService.getSharedIntent(id, req.userId);
  res.json({ success: true, data: intent });
});

export const joinSharedPlayIntent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedPlayIntentIdParams>(
    req,
    'params',
  );
  const intent = await PlayIntentShareService.joinSharedIntent(id, req.userId);
  res.json({ success: true, data: intent });
});

export const getPlayIntentPool = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');

  const query = getValidatedRequestPart<ValidatedPlayIntentScopeQuery>(
    req,
    'query',
  );
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { currentCityId: true, primarySport: true },
  });
  const cityId = query.cityId ?? user?.currentCityId ?? undefined;
  if (!cityId) throw new ApiError(400, 'City is required');

  const sport = query.sport ?? parseSport(user?.primarySport);

  const pool = await PlayIntentMatchService.getPoolForViewer(req.userId, cityId, sport);
  res.json({ success: true, data: pool });
});

export const getMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const proposal = await MatchProposalService.getById(id, req.userId);
  res.json({ success: true, data: proposal });
});

export const confirmMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const result = await MatchProposalService.confirm(id, req.userId);
  res.json({ success: true, data: result });
});

export const declineMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const result = await MatchProposalService.decline(id, req.userId);
  res.json({ success: true, data: result });
});

export const releaseMatchProposal = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const result = await MatchProposalService.releaseHost(id, req.userId);
  res.json({ success: true, data: result });
});

export const removeMatchProposalMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const body = getValidatedRequestPart<ValidatedRemoveProposalMemberInput>(
    req,
    'body',
  );
  const result = await MatchProposalService.removeMember(
    id,
    req.userId,
    body.userId,
  );
  res.json({ success: true, data: result });
});

export const addMatchProposalMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) throw new Error('User ID not found');
  const { id } = getValidatedRequestPart<ValidatedProposalIdParams>(
    req,
    'params',
  );
  const body = getValidatedRequestPart<ValidatedAddProposalMemberInput>(
    req,
    'body',
  );
  const result = await MatchProposalService.addMember(
    id,
    req.userId,
    body,
  );
  res.json({ success: true, data: result });
});
