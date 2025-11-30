import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as resultsService from '../services/results.service';
import * as outcomesService from '../services/results/outcomes.service';
import * as outcomeExplanationService from '../services/results/outcomeExplanation.service';

export const recalculateOutcomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  console.log(`[RECALCULATE CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  const result = await outcomesService.recalculateGameOutcomes(gameId, req.userId!);
  
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
  const { baseVersion } = req.body;

  await resultsService.deleteGameResults(gameId, req.userId!, baseVersion);

  res.json({
    success: true,
    message: 'Game results deleted successfully',
  });
});

export const editGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { baseVersion } = req.body;
  
  console.log(`[EDIT GAME RESULTS CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  await resultsService.editGameResults(gameId, req.userId!, baseVersion);
  
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

export const batchOps = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { ops } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'] as string;

  const result = await resultsService.batchOps(gameId, ops, req.userId!, idempotencyKey);

  if (result.applied.length > 0) {
    const socketService = (global as any).socketService;
    if (socketService) {
      socketService.emitGameResultsUpdated(gameId, req.userId!);
    }
  }

  res.json({
    success: true,
    data: result,
  });
});

export const getOutcomeExplanation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, userId } = req.params;

  const explanation = await outcomeExplanationService.getOutcomeExplanation(gameId, userId);

  if (!explanation) {
    res.status(404).json({
      success: false,
      message: 'Outcome not found',
    });
    return;
  }

  res.json({
    success: true,
    data: explanation,
  });
});

