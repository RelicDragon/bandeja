import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { Bet, TransactionType } from '@prisma/client';
import { BetCondition } from './betConditionEvaluator.service';
import { TransactionService } from '../transaction.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class BetService {
  static async getGameBets(gameId: string) {
    return await prisma.bet.findMany({
      where: { gameId },
      include: {
        creator: {
          select: USER_SELECT_FIELDS
        },
        acceptedByUser: {
          select: USER_SELECT_FIELDS
        },
        winner: {
          select: USER_SELECT_FIELDS
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async createBet(
    gameId: string,
    creatorId: string,
    condition: BetCondition,
    stakeType: 'COINS' | 'TEXT',
    stakeCoins: number | null,
    stakeText: string | null,
    rewardType: 'COINS' | 'TEXT',
    rewardCoins: number | null,
    rewardText: string | null
  ): Promise<Bet> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { resultsStatus: true }
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot create bets for finished games');
    }

    // If stake is coins, transfer from creator's wallet
    if (stakeType === 'COINS' && stakeCoins && stakeCoins > 0) {
      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
        select: { wallet: true }
      });

      if (!creator) {
        throw new ApiError(404, 'Creator not found');
      }

      if (creator.wallet < stakeCoins) {
        throw new ApiError(400, 'Insufficient coins in wallet');
      }

      // Transfer coins to escrow (BandejaBank) - use PURCHASE type which transfers to BandejaBank
      await TransactionService.createTransaction({
        type: TransactionType.PURCHASE,
        fromUserId: creatorId,
        transactionRows: [{
          name: `Bet stake for game ${gameId}`,
          price: stakeCoins,
          qty: 1,
          total: stakeCoins
        }]
      });
    }

    return await prisma.bet.create({
      data: {
        gameId,
        creatorId,
        condition: condition as any,
        stakeType,
        stakeCoins,
        stakeText,
        rewardType,
        rewardCoins,
        rewardText,
        status: 'OPEN'
      },
      include: {
        creator: {
          select: USER_SELECT_FIELDS
        }
      }
    });
  }

  static async acceptBet(betId: string, userId: string): Promise<Bet> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        game: {
          select: { resultsStatus: true }
        }
      }
    });

    if (!bet) {
      throw new ApiError(404, 'Bet not found');
    }

    if (bet.creatorId === userId) {
      throw new ApiError(400, 'Cannot accept your own bet');
    }

    if (bet.status !== 'OPEN') {
      throw new ApiError(400, 'Bet is not open');
    }

    if (bet.game.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot accept bets for finished games');
    }

    // If reward is coins, check acceptor has enough and transfer to escrow
    if (bet.rewardType === 'COINS' && bet.rewardCoins && bet.rewardCoins > 0) {
      const acceptor = await prisma.user.findUnique({
        where: { id: userId },
        select: { wallet: true }
      });

      if (!acceptor) {
        throw new ApiError(404, 'User not found');
      }

      if (acceptor.wallet < bet.rewardCoins) {
        throw new ApiError(400, 'Insufficient coins in wallet');
      }

      // Transfer coins to escrow (BandejaBank) - use PURCHASE type which transfers to BandejaBank
      await TransactionService.createTransaction({
        type: TransactionType.PURCHASE,
        fromUserId: userId,
        transactionRows: [{
          name: `Bet reward for game ${bet.gameId}`,
          price: bet.rewardCoins,
          qty: 1,
          total: bet.rewardCoins
        }]
      });
    }

    return await prisma.bet.update({
      where: { id: betId },
      data: {
        status: 'ACCEPTED',
        acceptedBy: userId,
        acceptedAt: new Date()
      },
      include: {
        creator: {
          select: USER_SELECT_FIELDS
        },
        acceptedByUser: {
          select: USER_SELECT_FIELDS
        }
      }
    });
  }

  static async cancelBet(betId: string, userId: string): Promise<void> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId }
    });

    if (!bet) {
      throw new ApiError(404, 'Bet not found');
    }

    if (bet.creatorId !== userId) {
      throw new ApiError(403, 'Only the creator can cancel a bet');
    }

    if (bet.status !== 'OPEN') {
      throw new ApiError(400, 'Only open bets can be cancelled');
    }

    // Refund stake coins if bet was created with coins
    if (bet.stakeType === 'COINS' && bet.stakeCoins && bet.stakeCoins > 0) {
      await TransactionService.createTransaction({
        type: TransactionType.REFUND,
        toUserId: bet.creatorId,
        transactionRows: [{
          name: `Bet cancellation refund for game ${bet.gameId}`,
          price: bet.stakeCoins,
          qty: 1,
          total: bet.stakeCoins
        }]
      });
    }

    await prisma.bet.update({
      where: { id: betId },
      data: { status: 'CANCELLED' }
    });
  }

  static async updateBet(
    betId: string,
    userId: string,
    data: Partial<{ 
      condition: BetCondition; 
      stakeType: 'COINS' | 'TEXT';
      stakeCoins: number | null;
      stakeText: string | null;
      rewardType: 'COINS' | 'TEXT';
      rewardCoins: number | null;
      rewardText: string | null;
    }>
  ): Promise<Bet> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        game: {
          select: { resultsStatus: true }
        }
      }
    });

    if (!bet) {
      throw new ApiError(404, 'Bet not found');
    }

    if (bet.creatorId !== userId) {
      throw new ApiError(403, 'Only the creator can update a bet');
    }

    if (bet.status !== 'OPEN') {
      throw new ApiError(400, 'Only open bets can be updated');
    }

    if (bet.game.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot update bets for finished games');
    }

    type StakeRewardType = 'COINS' | 'TEXT';
    const updateData: Partial<{
      condition: any;
      stakeType: StakeRewardType;
      stakeCoins: number | null;
      stakeText: string | null;
      rewardType: StakeRewardType;
      rewardCoins: number | null;
      rewardText: string | null;
    }> = {};

    if (data.condition) {
      updateData.condition = data.condition as any;
    }

    const stakeChangeRequested = data.stakeType !== undefined || data.stakeCoins !== undefined || data.stakeText !== undefined;
    if (stakeChangeRequested) {
      const nextStakeType: StakeRewardType = (data.stakeType || bet.stakeType) as StakeRewardType;
      const desiredStakeCoins: number | null = nextStakeType === 'COINS'
        ? (data.stakeCoins !== undefined ? data.stakeCoins : bet.stakeCoins || null)
        : null;
      const desiredStakeText: string | null = nextStakeType === 'TEXT'
        ? (data.stakeText !== undefined ? data.stakeText : bet.stakeText || null)
        : null;

      if (nextStakeType === 'COINS') {
        if (!desiredStakeCoins || desiredStakeCoins <= 0) {
          throw new ApiError(400, 'Stake coins must be greater than 0');
        }
      } else {
        if (!desiredStakeText) {
          throw new ApiError(400, 'Stake text is required');
        }
      }

      const stakeChanged =
        bet.stakeType !== nextStakeType ||
        (nextStakeType === 'COINS' && bet.stakeCoins !== desiredStakeCoins) ||
        (nextStakeType === 'TEXT' && bet.stakeText !== desiredStakeText);

      if (stakeChanged) {
        if (bet.stakeType === 'COINS' && bet.stakeCoins && bet.stakeCoins > 0) {
          await TransactionService.createTransaction({
            type: TransactionType.REFUND,
            toUserId: bet.creatorId,
            transactionRows: [{
              name: `Bet stake update refund for game ${bet.gameId}`,
              price: bet.stakeCoins,
              qty: 1,
              total: bet.stakeCoins
            }]
          });
        }

        if (nextStakeType === 'COINS') {
          const ensuredStakeCoins = desiredStakeCoins as number;
          const creator = await prisma.user.findUnique({
            where: { id: userId },
            select: { wallet: true }
          });

          if (!creator || creator.wallet < ensuredStakeCoins) {
            throw new ApiError(400, 'Insufficient coins in wallet');
          }

          await TransactionService.createTransaction({
            type: TransactionType.PURCHASE,
            fromUserId: userId,
            transactionRows: [{
              name: `Bet stake for game ${bet.gameId}`,
              price: ensuredStakeCoins,
              qty: 1,
              total: ensuredStakeCoins
            }]
          });
        }
      }

      updateData.stakeType = nextStakeType;
      updateData.stakeCoins = nextStakeType === 'COINS' ? desiredStakeCoins : null;
      updateData.stakeText = nextStakeType === 'TEXT' ? desiredStakeText : null;
    }

    const rewardChangeRequested = data.rewardType !== undefined || data.rewardCoins !== undefined || data.rewardText !== undefined;
    if (rewardChangeRequested) {
      const nextRewardType: StakeRewardType = (data.rewardType || bet.rewardType) as StakeRewardType;
      const desiredRewardCoins: number | null = nextRewardType === 'COINS'
        ? (data.rewardCoins !== undefined ? data.rewardCoins : bet.rewardCoins || null)
        : null;
      const desiredRewardText: string | null = nextRewardType === 'TEXT'
        ? (data.rewardText !== undefined ? data.rewardText : bet.rewardText || null)
        : null;

      if (nextRewardType === 'COINS') {
        if (!desiredRewardCoins || desiredRewardCoins <= 0) {
          throw new ApiError(400, 'Reward coins must be greater than 0');
        }
      } else {
        if (!desiredRewardText) {
          throw new ApiError(400, 'Reward text is required');
        }
      }

      updateData.rewardType = nextRewardType;
      updateData.rewardCoins = nextRewardType === 'COINS' ? desiredRewardCoins : null;
      updateData.rewardText = nextRewardType === 'TEXT' ? desiredRewardText : null;
    }

    return await prisma.bet.update({
      where: { id: betId },
      data: updateData,
      include: {
        creator: {
          select: USER_SELECT_FIELDS
        },
        acceptedByUser: {
          select: USER_SELECT_FIELDS
        }
      }
    });
  }
}
