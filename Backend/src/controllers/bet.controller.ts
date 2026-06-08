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
  const { gameId, condition, type, stakeType, stakeCoins, stakeText, rewardType, rewardCoins, rewardText } = req.body;
  const userId = req.userId!;
  const betType = type === 'SOCIAL' ? 'SOCIAL' : 'POOL';
  const resolvedStakeType = stakeType || 'COINS';
  const resolvedRewardType = rewardType || 'COINS';

  const bet = await BetService.createBet(
    gameId,
    userId,
    condition,
    betType,
    resolvedStakeType,
    stakeCoins || null,
    stakeText || null,
    resolvedRewardType,
    betType === 'POOL' ? null : (rewardCoins || null),
    betType === 'POOL' ? null : (rewardText || null)
  );

  res.json({ success: true, data: bet });
});

export const acceptBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { side } = req.body;
  const userId = req.userId!;

  const bet = await BetService.acceptBet(id, userId, side);

  res.json({ success: true, data: bet });
});

export const cancelBet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  await BetService.cancelBet(id, userId);

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

  res.json({ success: true, data: bet });
});
