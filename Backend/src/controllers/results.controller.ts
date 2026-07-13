import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import * as resultsService from '../services/results.service';
import * as roundGenerationService from '../services/results/roundGeneration.service';
import { GameService } from '../services/game/game.service';
import * as outcomesService from '../services/results/outcomes.service';
import * as outcomeExplanationService from '../services/results/outcomeExplanation.service';
import * as matchLiveScoringService from '../services/results/matchLiveScoring.service';
import { LIVE_SCORING_REASON_CODE } from '../services/results/liveScoringEngine/liveScoringRejectReasons';
import { liveSpectatorQueryTokenMaxBytes, signLiveSpectatorToken, verifyLiveSpectatorToken } from '../utils/jwt';
import { assertMatchBelongsToGame } from '../services/results/liveSpectator.service';

export const recalculateOutcomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  console.log(`[RECALCULATE CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  const result = await outcomesService.recalculateGameOutcomes(gameId);
  
  console.log(`[RECALCULATE CONTROLLER] Recalculation completed successfully for game ${gameId}`);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, req.userId!);
  }

  res.json({
    success: true,
    data: result,
  });
});

export const getGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const results = await resultsService.getGameResults(gameId);

  res.json({
    success: true,
    data: results,
  });
});

export const getRoundResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roundId } = req.params;

  const results = await resultsService.getRoundResults(roundId);

  res.json({
    success: true,
    data: results,
  });
});

export const getMatchResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { matchId } = req.params;

  const results = await resultsService.getMatchResults(matchId);

  res.json({
    success: true,
    data: results,
  });
});

export const deleteGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  await resultsService.deleteGameResults(gameId);

  res.json({
    success: true,
    message: 'Game results deleted successfully',
  });
});

export const resetGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  console.log(`[RESET GAME RESULTS CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  await resultsService.resetGameResults(gameId);
  
  console.log(`[RESET GAME RESULTS CONTROLLER] Results reset successfully for game ${gameId}`);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Game results reset successfully',
  });
});

export const editGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  console.log(`[EDIT GAME RESULTS CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  await resultsService.editGameResults(gameId);
  
  console.log(`[EDIT GAME RESULTS CONTROLLER] Results edited successfully for game ${gameId}`);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Game results reverted to IN_PROGRESS, outcomes undone',
  });
});

export const syncResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { rounds } = req.body;

  await resultsService.syncResults(gameId, rounds || []);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Results synced successfully',
  });
});

export const generateRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const { roundId } = await roundGenerationService.generateAndCreateRound(gameId);
  const round = await roundGenerationService.fetchRoundApiPayload(roundId);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    data: { round },
  });
});

export const startResultsEntryWithGeneratedRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const { roundId, alreadyHadRounds } = await roundGenerationService.startResultsEntryWithGeneratedRound(gameId);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  const game = await GameService.getGameById(gameId, req.userId);
  const round = roundId ? await roundGenerationService.fetchRoundApiPayload(roundId) : null;

  res.json({
    success: true,
    data: { game, round, alreadyHadRounds },
  });
});

export const createRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { id } = req.body;

  await resultsService.createRound(gameId, id);

  res.json({
    success: true, 
    message: 'Round created successfully',
  });
});

export const deleteRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId } = req.params;

  await resultsService.deleteRound(gameId, roundId);

  res.json({
    success: true,
    message: 'Round deleted successfully',
  });
});

export const createMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId } = req.params;
  const { id } = req.body;

  await resultsService.createMatch(gameId, roundId, id);

  res.json({
    success: true,
    message: 'Match created successfully',
  });
});

export const deleteMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;

  await resultsService.deleteMatch(gameId, matchId);

  res.json({
    success: true,
    message: 'Match deleted successfully',
  });
});

export const updateMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;
  const matchData = req.body;

  const { liveScoringCleared } = await resultsService.updateMatch(gameId, matchId, matchData, {
    userId: req.userId ?? null,
  });
  if (liveScoringCleared) {
    matchLiveScoringService.notifyMatchLiveScoringCleared(gameId, matchId);
  }

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Match updated successfully',
    data: { liveScoringCleared },
  });
});

export const patchMatchMetadata = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;
  const patch = req.body?.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ApiError(400, 'patch must be a non-array object');
  }

  const { liveScoringCleared } = await resultsService.patchMatchMetadata(
    gameId,
    matchId,
    patch as Record<string, unknown>,
    { userId: req.userId ?? null }
  );
  if (liveScoringCleared) {
    matchLiveScoringService.notifyMatchLiveScoringCleared(gameId, matchId);
  }

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    data: { liveScoringCleared },
  });
});

export const patchMatchLiveScoring = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;
  if (!Object.prototype.hasOwnProperty.call(req.body, 'state')) {
    throw new ApiError(400, 'state is required (object or null)', true, {
      reasonCode: LIVE_SCORING_REASON_CODE.MISSING_STATE,
    });
  }
  let baseRevision: number | null = null;
  if (req.body.baseRevision !== null && req.body.baseRevision !== undefined) {
    const n = Number(req.body.baseRevision);
    if (!Number.isFinite(n)) {
      throw new ApiError(400, 'baseRevision must be a finite number or null', true, {
        reasonCode: LIVE_SCORING_REASON_CODE.INVALID_BASE_REVISION,
      });
    }
    baseRevision = n;
  }

  const data = await matchLiveScoringService.patchMatchLiveScoring(
    gameId,
    matchId,
    req.userId!,
    req.user?.isAdmin || false,
    {
      state:
        req.body.state === null || req.body.state === undefined
          ? null
          : (req.body.state as Record<string, unknown>),
      baseRevision,
      clientMessageId: typeof req.body.clientMessageId === 'string' ? req.body.clientMessageId : undefined,
      opId: typeof req.body.opId === 'string' ? req.body.opId : undefined,
    }
  );

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    data,
  });
});

export const postLiveSpectatorToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, matchId } = req.params;
  await assertMatchBelongsToGame(gameId, matchId);
  const token = signLiveSpectatorToken(gameId, matchId);
  res.json({ success: true, data: { token } });
});

export const getGameResultsForSpectator = asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const st = typeof req.query.st === 'string' ? req.query.st : '';
  if (!st) {
    throw new ApiError(400, 'Missing spectator token');
  }
  if (st.length > liveSpectatorQueryTokenMaxBytes()) {
    throw new ApiError(400, 'Invalid spectator token');
  }
  let payload: { gameId: string; matchId: string };
  try {
    payload = verifyLiveSpectatorToken(st);
  } catch {
    throw new ApiError(401, 'Invalid or expired spectator token');
  }
  if (payload.gameId !== gameId) {
    throw new ApiError(400, 'Token game mismatch');
  }
  await assertMatchBelongsToGame(gameId, payload.matchId);

  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const results = await resultsService.getGameResults(gameId);
  res.json({
    success: true,
    data: results,
    spectator: { matchId: payload.matchId },
  });
});

export const getOutcomeExplanation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, userId } = req.params;

  const explanation = await outcomeExplanationService.getOutcomeExplanation(gameId, userId);

  if (!explanation) {
    throw new ApiError(404, 'Outcome not found');
  }

  let viewerIsAdmin = false;
  if (req.userId) {
    const viewer = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isAdmin: true },
    });
    viewerIsAdmin = Boolean(viewer?.isAdmin);
  }

  const { ratingUncertainty, ...rest } = explanation;
  const data = {
    ...rest,
    ...(viewerIsAdmin && ratingUncertainty != null && ratingUncertainty > 0
      ? { ratingUncertainty }
      : {}),
  };

  res.json({
    success: true,
    data,
  });
});

