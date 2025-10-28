import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as resultsService from '../services/results.service';
import * as outcomesService from '../services/results/outcomes.service';

export const saveGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const resultsData = req.body;

  const result = await resultsService.saveGameResults(gameId, resultsData, req.userId!);

  res.json({
    success: true,
    data: result,
  });
});

export const generateOutcomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const outcomes = await outcomesService.generateGameOutcomes(gameId);

  res.json({
    success: true,
    data: outcomes,
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

