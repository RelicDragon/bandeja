import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { GameService } from '../services/game/game.service';
import { ParticipantService } from '../services/game/participant.service';
import { JoinQueueService } from '../services/game/joinQueue.service';
import { AdminService } from '../services/game/admin.service';
import { OwnershipService } from '../services/game/ownership.service';

export const createGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const game = await GameService.createGame(req.body, req.userId!);

  res.status(201).json({
    success: true,
    data: game,
  });
});

export const getGameById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const game = await GameService.getGameById(id, req.userId);

  res.json({
    success: true,
    data: game,
    serverTime: new Date().toISOString(),
  });
});

export const getGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const games = await GameService.getGames(req.query, req.userId, req.user?.currentCityId);

  res.json({
    success: true,
    data: games,
    serverTime: new Date().toISOString(),
  });
});

export const updateGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const game = await GameService.updateGame(id, req.body, req.userId!);

  res.json({
    success: true,
    data: game,
  });
});

export const deleteGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await GameService.deleteGame(id, req.userId!);

  res.json({
    success: true,
    message: 'Game deleted successfully',
  });
});

export const joinGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.joinGame(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const leaveGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.leaveGame(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const joinAsGuest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.joinAsGuest(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const togglePlayingStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isPlaying } = req.body;
  const message = await ParticipantService.togglePlayingStatus(id, req.userId!, isPlaying);

  res.json({
    success: true,
    message,
  });
});

export const addAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.addAdmin(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const revokeAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.revokeAdmin(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const kickUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.kickUser(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const transferOwnership = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await OwnershipService.transferOwnership(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const acceptJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await JoinQueueService.acceptJoinQueue(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const declineJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await JoinQueueService.declineJoinQueue(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

