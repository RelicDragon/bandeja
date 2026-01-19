import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { BetService } from '../services/bets/bet.service';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';

export const getGameBets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  
  // Verify game exists
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const bets = await BetService.getGameBets(gameId);
  res.json({ success: true, data: bets });
});

export const createBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, condition, stakeType, stakeCoins, stakeText, rewardType, rewardCoins, rewardText } = req.body;
  const userId = req.userId!;
  const resolvedStakeType = stakeType || 'COINS';
  const resolvedRewardType = rewardType || 'COINS';

  if (!condition) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  if (resolvedStakeType === 'COINS' && (!stakeCoins || stakeCoins <= 0)) {
    return res.status(400).json({ success: false, message: 'Stake coins must be greater than 0' });
  }

  if (resolvedStakeType === 'TEXT' && !stakeText) {
    return res.status(400).json({ success: false, message: 'Stake text is required' });
  }

  if (resolvedRewardType === 'COINS' && (!rewardCoins || rewardCoins <= 0)) {
    return res.status(400).json({ success: false, message: 'Reward coins must be greater than 0' });
  }

  if (resolvedRewardType === 'TEXT' && !rewardText) {
    return res.status(400).json({ success: false, message: 'Reward text is required' });
  }

  const bet = await BetService.createBet(
    gameId, 
    userId, 
    condition, 
    resolvedStakeType,
    stakeCoins || null,
    stakeText || null,
    resolvedRewardType,
    rewardCoins || null,
    rewardText || null
  );

  // Emit socket event
  try {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emit('bet:created', {
        gameId,
        bet
      });
    }
  } catch (error) {
    console.error('Failed to emit bet created event:', error);
  }

  res.json({ success: true, data: bet });
});

export const acceptBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const bet = await BetService.acceptBet(id, userId);

  // Emit socket event
  try {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emit('bet:updated', {
        gameId: bet.gameId,
        bet
      });
    }
  } catch (error) {
    console.error('Failed to emit bet updated event:', error);
  }

  res.json({ success: true, data: bet });
});

export const cancelBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  // Get bet first to get gameId
  const bet = await prisma.bet.findUnique({
    where: { id },
    select: { gameId: true }
  });

  if (!bet) {
    throw new Error('Bet not found');
  }

  await BetService.cancelBet(id, userId);

  // Emit socket event
  try {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emit('bet:deleted', {
        gameId: bet.gameId,
        betId: id
      });
    }
  } catch (error) {
    console.error('Failed to emit bet deleted event:', error);
  }

  res.json({ success: true, message: 'Bet cancelled' });
});

export const updateBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { condition, stakeType, stakeCoins, stakeText, rewardType, rewardCoins, rewardText } = req.body;

  const bet = await BetService.updateBet(id, userId, { 
    condition, 
    stakeType, 
    stakeCoins, 
    stakeText, 
    rewardType, 
    rewardCoins, 
    rewardText 
  });

  // Emit socket event
  try {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emit('bet:updated', {
        gameId: bet.gameId,
        bet
      });
    }
  } catch (error) {
    console.error('Failed to emit bet updated event:', error);
  }

  res.json({ success: true, data: bet });
});
