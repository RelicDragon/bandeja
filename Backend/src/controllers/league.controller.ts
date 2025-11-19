import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { LeagueCreateService } from '../services/league/create.service';
import { LeagueReadService } from '../services/league/read.service';

export const createLeague = asyncHandler(async (req: AuthRequest, res: Response) => {
  const league = await LeagueCreateService.createLeague(req.body, req.userId!);

  res.status(201).json({
    success: true,
    data: league,
  });
});

export const getLeagueRounds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  
  const rounds = await LeagueReadService.getLeagueRounds(leagueSeasonId);

  res.json({
    success: true,
    data: rounds,
  });
});

export const getLeagueStandings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  
  const standings = await LeagueReadService.getLeagueStandings(leagueSeasonId);

  res.json({
    success: true,
    data: standings,
  });
});

export const createLeagueRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  
  const round = await LeagueCreateService.createLeagueRound(leagueSeasonId, req.userId!);

  res.status(201).json({
    success: true,
    data: round,
  });
});

