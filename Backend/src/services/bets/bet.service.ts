import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { Bet, BetType, TransactionType } from '@prisma/client';
import { BetCondition } from './betConditionEvaluator.service';
import { TransactionService } from '../transaction.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import notificationService from '../notification.service';

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
        },
        participants: {
          include: {
            user: { select: USER_SELECT_FIELDS }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async createBet(
    gameId: string,
    creatorId: string,
    condition: BetCondition,
    type: BetType,
    stakeType: 'COINS' | 'TEXT',
    stakeCoins: number | null,
    stakeText: string | null,
    rewardType: 'COINS' | 'TEXT',
    rewardCoins: number | null,
    rewardText: string | null
  ): Promise<Bet> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        resultsStatus: true,
        hasFixedTeams: true,
        fixedTeams: { select: { id: true } }
      }
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.resultsStatus === 'FINAL') {
      throw new ApiError(400, 'Cannot create bets for finished games');
    }

    const entityType = condition.entityType;
    if (entityType != null && entityType !== 'USER' && entityType !== 'TEAM') {
      throw new ApiError(400, 'Invalid condition entity type');
    }

    if (condition.entityType === 'TEAM') {
      if (!condition.entityId) {
        throw new ApiError(400, 'Entity (team) is required for team condition');
      }
      if (!game.hasFixedTeams || !game.fixedTeams?.length || game.fixedTeams.length < 2) {
        throw new ApiError(400, 'Game does not have fixed teams set');
      }
      const teamExists = game.fixedTeams.some((t) => t.id === condition.entityId);
      if (!teamExists) {
        throw new ApiError(400, 'Invalid team for this game');
      }
    } else if (condition.entityType === 'USER' && condition.entityId) {
      const participant = await prisma.gameParticipant.findFirst({
        where: { gameId, userId: condition.entityId, isPlaying: true },
        select: { userId: true }
      });
      if (!participant) {
        throw new ApiError(400, 'Selected user is not a playing participant in this game');
      }
    }

    const isPool = type === 'POOL';
    if (isPool && stakeType === 'COINS' && (!stakeCoins || stakeCoins <= 0)) {
      throw new ApiError(400, 'Pool stake coins must be greater than 0');
    }
    if (isPool && stakeType === 'TEXT' && !stakeText?.trim()) {
      throw new ApiError(400, 'Pool stake text is required');
    }

    let stakeCharged = false;
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
      stakeCharged = true;
    }

    try {
      if (isPool && (stakeType === 'COINS' ? stakeCoins && stakeCoins > 0 : stakeText?.trim())) {
        const bet = await prisma.$transaction(async (tx) => {
          const created = await tx.bet.create({
            data: {
              gameId,
              creatorId,
              type,
              condition: condition as any,
              stakeType,
              stakeCoins,
              stakeText,
              rewardType: 'COINS',
              rewardCoins: 0,
              rewardText: null,
              poolTotalCoins: stakeType === 'COINS' && stakeCoins ? stakeCoins : null,
              status: 'OPEN'
            }
          });
          await tx.betParticipant.create({
            data: { betId: created.id, userId: creatorId, side: 'WITH_CREATOR' }
          });
          return await tx.bet.findUnique({
            where: { id: created.id },
            include: {
              creator: { select: USER_SELECT_FIELDS },
              participants: { include: { user: { select: USER_SELECT_FIELDS } } }
            }
          });
        });
        return bet! as Bet;
      }
      const bet = await prisma.bet.create({
        data: {
          gameId,
          creatorId,
          type,
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
          creator: { select: USER_SELECT_FIELDS },
          participants: {
            include: { user: { select: USER_SELECT_FIELDS } }
          }
        }
      });
      return bet as Bet;
    } catch (err) {
      if (stakeCharged && stakeType === 'COINS' && stakeCoins && stakeCoins > 0) {
        await TransactionService.createTransaction({
          type: TransactionType.REFUND,
          toUserId: creatorId,
          transactionRows: [{
            name: `Bet create rollback refund for game ${gameId}`,
            price: stakeCoins,
            qty: 1,
            total: stakeCoins
          }]
        }).catch(rollbackErr =>
          console.error('Failed to rollback stake after bet create failure:', rollbackErr)
        );
      }
      throw err;
    }
  }

  static async acceptBet(betId: string, userId: string, side?: 'WITH_CREATOR' | 'AGAINST_CREATOR'): Promise<Bet> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        game: { select: { resultsStatus: true } },
        participants: true
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

    if (bet.type === 'POOL') {
      if (!side || (side !== 'WITH_CREATOR' && side !== 'AGAINST_CREATOR')) {
        throw new ApiError(400, 'Pool bet requires side: WITH_CREATOR or AGAINST_CREATOR');
      }
      const existing = bet.participants.find(p => p.userId === userId);
      if (existing) {
        throw new ApiError(400, 'Already joined this pool');
      }
      const stakeCoins = bet.stakeType === 'COINS' ? (bet.stakeCoins ?? 0) : 0;
      if (bet.stakeType === 'COINS') {
        if (stakeCoins <= 0) {
          throw new ApiError(400, 'Invalid pool stake');
        }
        const acceptor = await prisma.user.findUnique({
          where: { id: userId },
          select: { wallet: true }
        });
        if (!acceptor) {
          throw new ApiError(404, 'User not found');
        }
        if (acceptor.wallet < stakeCoins) {
          throw new ApiError(400, 'Insufficient coins in wallet');
        }
        await TransactionService.createTransaction({
          type: TransactionType.PURCHASE,
          fromUserId: userId,
          transactionRows: [{
            name: `Pool bet stake for game ${bet.gameId}`,
            price: stakeCoins,
            qty: 1,
            total: stakeCoins
          }]
        });
      }
      try {
        if (bet.stakeType === 'COINS' && stakeCoins > 0) {
          await prisma.$transaction([
            prisma.betParticipant.create({
              data: { betId, userId, side }
            }),
            prisma.bet.update({
              where: { id: betId },
              data: { poolTotalCoins: { increment: stakeCoins } }
            })
          ]);
        } else {
          await prisma.betParticipant.create({
            data: { betId, userId, side }
          });
        }
      } catch (err) {
        if (bet.stakeType === 'COINS' && stakeCoins > 0) {
          await TransactionService.createTransaction({
            type: TransactionType.REFUND,
            toUserId: userId,
            transactionRows: [{
              name: `Pool join rollback refund for game ${bet.gameId}`,
              price: stakeCoins,
              qty: 1,
              total: stakeCoins
            }]
          }).catch(() => {});
        }
        throw err;
      }
      const updated = await prisma.bet.findUnique({
        where: { id: betId },
        include: {
          creator: { select: USER_SELECT_FIELDS },
          acceptedByUser: { select: USER_SELECT_FIELDS },
          participants: { include: { user: { select: USER_SELECT_FIELDS } } }
        }
      });
      return updated! as Bet;
    }

    let rewardCharged = false;
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
      rewardCharged = true;
    }

    try {
      return await prisma.bet.update({
        where: { id: betId },
        data: {
          status: 'ACCEPTED',
          acceptedBy: userId,
          acceptedAt: new Date()
        },
        include: {
          creator: { select: USER_SELECT_FIELDS },
          acceptedByUser: { select: USER_SELECT_FIELDS },
          participants: { include: { user: { select: USER_SELECT_FIELDS } } }
        }
      }) as Bet;
    } catch (err) {
      if (rewardCharged && bet.rewardType === 'COINS' && bet.rewardCoins && bet.rewardCoins > 0) {
        await TransactionService.createTransaction({
          type: TransactionType.REFUND,
          toUserId: userId,
          transactionRows: [{
            name: `Bet accept rollback refund for game ${bet.gameId}`,
            price: bet.rewardCoins,
            qty: 1,
            total: bet.rewardCoins
          }]
        }).catch(rollbackErr =>
          console.error('Failed to rollback reward after bet accept failure:', rollbackErr)
        );
      }
      throw err;
    }
  }

  static async cancelBet(betId: string, userId: string): Promise<void> {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { participants: true }
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

    await prisma.bet.update({
      where: { id: betId },
      data: { status: 'CANCELLED' }
    });

    const stakeCoins = bet.stakeType === 'COINS' && bet.stakeCoins ? bet.stakeCoins : 0;
    if (bet.type === 'POOL' && stakeCoins > 0) {
      for (const p of bet.participants) {
        await TransactionService.createTransaction({
          type: TransactionType.REFUND,
          toUserId: p.userId,
          transactionRows: [{
            name: `Pool bet cancellation refund for game ${bet.gameId}`,
            price: stakeCoins,
            qty: 1,
            total: stakeCoins
          }]
        }).catch(err => console.error(`Refund participant ${p.userId} failed:`, err));
      }
    }
    if (stakeCoins > 0) {
      await TransactionService.createTransaction({
        type: TransactionType.REFUND,
        toUserId: bet.creatorId,
        transactionRows: [{
          name: `Bet cancellation refund for game ${bet.gameId}`,
          price: stakeCoins,
          qty: 1,
          total: stakeCoins
        }]
      });
    }
  }

  static async cancelBetsWithUserInCondition(gameId: string, userId: string): Promise<void> {
    const [bets, game] = await Promise.all([
      prisma.bet.findMany({
        where: {
          gameId,
          status: { in: ['OPEN', 'ACCEPTED'] }
        },
        include: {
          creator: { select: USER_SELECT_FIELDS },
          acceptedByUser: { select: USER_SELECT_FIELDS },
          participants: true
        }
      }),
      prisma.game.findUnique({
        where: { id: gameId },
        select: {
          fixedTeams: {
            include: { players: { select: { userId: true } } }
          }
        }
      })
    ]);

    const toCancel = bets.filter(b => {
      const c = b.condition as { entityType?: string; entityId?: string } | null;
      if (!c?.entityId) return false;
      if (c.entityType === 'USER') return c.entityId === userId;
      if (c.entityType === 'TEAM') {
        const team = game?.fixedTeams?.find((t: { id: string; players: { userId: string }[] }) => t.id === c.entityId);
        return team?.players?.some((p: { userId: string }) => p.userId === userId) ?? false;
      }
      return false;
    });
    if (toCancel.length === 0) return;

    const resolutionReason = 'Bet cancelled because a player in the condition left the game.';

    await prisma.$transaction(async (tx) => {
      for (const bet of toCancel) {
        await tx.bet.update({
          where: { id: bet.id },
          data: { status: 'CANCELLED', resolutionReason }
        });
      }
    });

    const stakeRefund = (bet: { stakeType: string; stakeCoins: number | null; type: string }) =>
      bet.stakeType === 'COINS' && bet.stakeCoins && bet.stakeCoins > 0 ? bet.stakeCoins : 0;

    for (const bet of toCancel) {
      const coins = stakeRefund(bet);
      if (bet.type === 'POOL' && coins > 0) {
        for (const p of bet.participants) {
          try {
            await TransactionService.createTransaction({
              type: TransactionType.REFUND,
              toUserId: p.userId,
              transactionRows: [{
                name: `Bet cancelled (player left) refund for game ${bet.gameId}`,
                price: coins,
                qty: 1,
                total: coins
              }]
            });
          } catch (err) {
            console.error(`Failed to refund pool participant ${p.userId} for bet ${bet.id}:`, err);
          }
        }
      }
      if (coins > 0) {
        try {
          await TransactionService.createTransaction({
            type: TransactionType.REFUND,
            toUserId: bet.creatorId,
            transactionRows: [{
              name: `Bet cancelled (player left) refund for game ${bet.gameId}`,
              price: coins,
              qty: 1,
              total: coins
            }]
          });
        } catch (err) {
          console.error(`Failed to refund stake for bet ${bet.id} (creator ${bet.creatorId}):`, err);
        }
      }
      if (bet.type !== 'POOL' && bet.status === 'ACCEPTED' && bet.rewardType === 'COINS' && bet.rewardCoins && bet.rewardCoins > 0 && bet.acceptedBy) {
        try {
          await TransactionService.createTransaction({
            type: TransactionType.REFUND,
            toUserId: bet.acceptedBy,
            transactionRows: [{
              name: `Bet cancelled (player left) refund for game ${bet.gameId}`,
              price: bet.rewardCoins,
              qty: 1,
              total: bet.rewardCoins
            }]
          });
        } catch (err) {
          console.error(`Failed to refund reward for bet ${bet.id} (acceptor ${bet.acceptedBy}):`, err);
        }
      }
      const notifyUserIds = new Set<string>([bet.creatorId, ...bet.participants.map(p => p.userId)]);
      if (bet.acceptedBy) notifyUserIds.add(bet.acceptedBy);
      for (const uid of notifyUserIds) {
        try {
          await notificationService.sendBetCancelledNotification(bet.id, uid);
        } catch (err) {
          console.error(`Failed to send bet cancelled notification to ${uid}:`, err);
        }
      }
    }
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

    if (bet.type === 'POOL') {
      throw new ApiError(400, 'Pool bets cannot be updated');
    }

    if (data.condition) {
      const cond = data.condition as BetCondition;
      const et = cond.entityType;
      if (et != null && et !== 'USER' && et !== 'TEAM') {
        throw new ApiError(400, 'Invalid condition entity type');
      }
      if (cond.entityType === 'TEAM') {
        if (!cond.entityId) {
          throw new ApiError(400, 'Entity (team) is required for team condition');
        }
        const gameWithTeams = await prisma.game.findUnique({
          where: { id: bet.gameId },
          select: { hasFixedTeams: true, fixedTeams: { select: { id: true } } }
        });
        if (!gameWithTeams?.hasFixedTeams || !gameWithTeams.fixedTeams?.length || gameWithTeams.fixedTeams.length < 2) {
          throw new ApiError(400, 'Game does not have fixed teams set');
        }
        if (!gameWithTeams.fixedTeams.some((t) => t.id === cond.entityId)) {
          throw new ApiError(400, 'Invalid team for this game');
        }
      } else if (cond.entityType === 'USER' && cond.entityId) {
        const participant = await prisma.gameParticipant.findFirst({
          where: { gameId: bet.gameId, userId: cond.entityId, isPlaying: true },
          select: { userId: true }
        });
        if (!participant) {
          throw new ApiError(400, 'Selected user is not a playing participant in this game');
        }
      }
    }

    type StakeRewardType = 'COINS' | 'TEXT';
    let stakeRefunded = 0;
    let stakeCharged = 0;
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
          stakeRefunded = bet.stakeCoins;
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
          stakeCharged = ensuredStakeCoins;
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

    try {
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
    } catch (err) {
      if (stakeCharged > 0) {
        await TransactionService.createTransaction({
          type: TransactionType.REFUND,
          toUserId: bet.creatorId,
          transactionRows: [{
            name: `Bet update rollback refund for game ${bet.gameId}`,
            price: stakeCharged,
            qty: 1,
            total: stakeCharged
          }]
        }).catch(rollbackErr =>
          console.error('Failed to rollback stake charge after bet update failure:', rollbackErr)
        );
      }
      if (stakeRefunded > 0) {
        await TransactionService.createTransaction({
          type: TransactionType.PURCHASE,
          fromUserId: bet.creatorId,
          transactionRows: [{
            name: `Bet update rollback restore stake for game ${bet.gameId}`,
            price: stakeRefunded,
            qty: 1,
            total: stakeRefunded
          }]
        }).catch(rollbackErr =>
          console.error('Failed to rollback stake refund after bet update failure:', rollbackErr)
        );
      }
      throw err;
    }
  }
}
