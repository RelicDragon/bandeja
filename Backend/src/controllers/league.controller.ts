import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { LeagueCreateService } from '../services/league/create.service';
import { LeagueReadService } from '../services/league/read.service';
import { LeagueSyncService } from '../services/league/sync.service';
import { LeagueGroupManagementService } from '../services/league/groups.service';
import { LeagueBroadcastService } from '../services/league/broadcast.service';

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
  const { creationType } = req.body;
  
  const round = await LeagueCreateService.createLeagueRound(leagueSeasonId, req.userId!, creationType);

  res.status(201).json({
    success: true,
    data: round,
  });
});

export const createGameForRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueRoundId } = req.params;
  const { leagueGroupId } = req.body;
  
  const game = await LeagueCreateService.createGameForRound(leagueRoundId, req.userId!, leagueGroupId);

  res.status(201).json({
    success: true,
    data: game,
  });
});

export const syncLeagueParticipants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  
  const standings = await LeagueSyncService.syncLeagueParticipants(leagueSeasonId, req.userId!);

  res.json({
    success: true,
    data: standings,
  });
});

export const createLeagueGroups = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  const { numberOfGroups } = req.body;
  
  const groups = await LeagueCreateService.createLeagueGroups(leagueSeasonId, numberOfGroups, req.userId!);

  res.status(201).json({
    success: true,
    data: groups,
  });
});

export const getLeagueGroups = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;

  const data = await LeagueGroupManagementService.getGroups(leagueSeasonId, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const createManualLeagueGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  const { name } = req.body;

  const data = await LeagueGroupManagementService.createGroup(leagueSeasonId, name, req.userId!);

  res.status(201).json({
    success: true,
    data,
  });
});

export const renameLeagueGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const { name } = req.body;

  const data = await LeagueGroupManagementService.renameGroup(groupId, name, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const deleteLeagueGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;

  const data = await LeagueGroupManagementService.deleteGroup(groupId, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const addParticipantToLeagueGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const { participantId } = req.body;

  const data = await LeagueGroupManagementService.addParticipant(groupId, participantId, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const removeParticipantFromLeagueGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { groupId, participantId } = req.params;

  const data = await LeagueGroupManagementService.removeParticipant(groupId, participantId, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const reorderLeagueGroups = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueSeasonId } = req.params;
  const { groupIds } = req.body;

  const data = await LeagueGroupManagementService.reorderGroups(leagueSeasonId, groupIds, req.userId!);

  res.json({
    success: true,
    data,
  });
});

export const deleteLeagueRound = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueRoundId } = req.params;

  await LeagueCreateService.deleteLeagueRound(leagueRoundId, req.userId!);

  res.json({
    success: true,
    data: { id: leagueRoundId },
  });
});

export const sendRoundStartMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { leagueRoundId } = req.params;

  const result = await LeagueBroadcastService.broadcastRoundStartMessage(leagueRoundId, req.userId!);

  res.json({
    success: true,
    data: result,
  });
});

