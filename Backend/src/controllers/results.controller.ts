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

  await resultsService.deleteGameResults(gameId, req.userId!);

  res.json({
    success: true,
    message: 'Game results deleted successfully',
  });
});

export const resetGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  console.log(`[RESET GAME RESULTS CONTROLLER] Endpoint hit for game ${gameId} by user ${req.userId}`);

  await resultsService.resetGameResults(gameId, req.userId!);
  
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

  await resultsService.editGameResults(gameId, req.userId!);
  
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

  await resultsService.syncResults(gameId, rounds || [], req.userId!);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Results synced successfully',
  });
});

export const createRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { id, name } = req.body;

  await resultsService.createRound(gameId, id, name, req.userId!);

  res.json({
    success: true,
    message: 'Round created successfully',
  });
});

export const deleteRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId } = req.params;

  await resultsService.deleteRound(gameId, roundId, req.userId!);

  res.json({
    success: true,
    message: 'Round deleted successfully',
  });
});

export const createMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId } = req.params;
  const { id } = req.body;

  await resultsService.createMatch(gameId, roundId, id, req.userId!);

  res.json({
    success: true,
    message: 'Match created successfully',
  });
});

export const deleteMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId, matchId } = req.params;

  await resultsService.deleteMatch(gameId, roundId, matchId, req.userId!);

  res.json({
    success: true,
    message: 'Match deleted successfully',
  });
});

export const updateMatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, roundId, matchId } = req.params;
  const matchData = req.body;

  await resultsService.updateMatch(gameId, roundId, matchId, matchData, req.userId!);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitGameResultsUpdated(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: 'Match updated successfully',
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

