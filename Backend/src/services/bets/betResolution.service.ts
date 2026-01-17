import prisma from '../../config/database';
import { Bet, TransactionType, Prisma } from '@prisma/client';
import { evaluateBetCondition, BetEvaluationResult } from './betConditionEvaluator.service';
import { TransactionService } from '../transaction.service';
import notificationService from '../notification.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Called when game resultsStatus changes to FINAL
 * Resolves all OPEN/ACCEPTED bets for the game
 */
export async function resolveGameBets(gameId: string): Promise<void> {
  console.log(`[BET RESOLUTION] Starting bet resolution for game ${gameId}`);
  
  return await prisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          include: {
            matches: {
              include: {
                teams: {
                  include: {
                    players: {
                      include: { 
                        user: {
                          select: USER_SELECT_FIELDS,
                        }
                      }
                    }
                  }
                },
                sets: true
              }
            }
          }
        },
        outcomes: {
          include: { 
            user: {
              select: USER_SELECT_FIELDS,
            }
          }
        }
      }
    });

    if (!game) {
      console.log(`[BET RESOLUTION] Game ${gameId} not found, aborting bet resolution`);
      return;
    }

    if (game.resultsStatus !== 'FINAL') {
      console.log(`[BET RESOLUTION] Game ${gameId} resultsStatus is ${game.resultsStatus}, not FINAL. Aborting bet resolution`);
      return;
    }

    console.log(`[BET RESOLUTION] Game ${gameId} found with FINAL status, fetching bets with status OPEN or ACCEPTED`);
    
    const bets = await tx.bet.findMany({
      where: {
        gameId,
        status: { in: ['OPEN', 'ACCEPTED'] }
      },
      include: {
        creator: {
          select: USER_SELECT_FIELDS,
        },
        acceptedByUser: {
          select: USER_SELECT_FIELDS,
        }
      }
    });

    console.log(`[BET RESOLUTION] Found ${bets.length} bets to process for game ${gameId}`);

    // Transform game data to match evaluator interface
    const gameResults = {
      rounds: game.rounds.map(round => ({
        matches: round.matches.map(match => ({
          teams: match.teams.map(team => ({
            id: team.id,
            teamNumber: team.teamNumber,
            playerIds: team.players.map(p => p.userId),
            score: team.score || 0
          })),
          sets: match.sets.map(set => ({
            teamAScore: set.teamAScore,
            teamBScore: set.teamBScore
          })),
          winnerId: match.winnerId
        }))
      })),
      outcomes: game.outcomes.map(outcome => ({
        userId: outcome.userId,
        isWinner: outcome.isWinner,
        wins: outcome.wins,
        losses: outcome.losses,
        ties: outcome.ties
      }))
    };

    const processedBetIds: string[] = [];
    const failedBetIds: string[] = [];

    for (const bet of bets) {
      try {
        console.log(`[BET RESOLUTION] Processing bet ${bet.id} (status: ${bet.status}, creator: ${bet.creatorId}, acceptedBy: ${bet.acceptedBy || 'none'})`);
        
        // Idempotency check: Skip if already resolved or cancelled
        const currentBet = await tx.bet.findUnique({
          where: { id: bet.id },
          select: { id: true, status: true }
        });

        if (!currentBet) {
          console.log(`[BET RESOLUTION] Bet ${bet.id} no longer exists, skipping`);
          continue;
        }

        if (currentBet.status === 'RESOLVED' || currentBet.status === 'CANCELLED') {
          console.log(`[BET RESOLUTION] Bet ${bet.id} already ${currentBet.status}, skipping (idempotency check)`);
          continue;
        }

        if (bet.status === 'OPEN' && !bet.acceptedBy) {
          await cancelOpenBet(bet, tx);
          processedBetIds.push(bet.id);
          continue;
        }

        console.log(`[BET RESOLUTION] Evaluating bet condition for bet ${bet.id}`);
        const result = await evaluateBetCondition(bet, gameResults);
        console.log(`[BET RESOLUTION] Bet ${bet.id} evaluation result: won=${result.won}, reason=${result.reason}`);
        
        await resolveBetWithRetry(bet, result, tx);
        processedBetIds.push(bet.id);
        console.log(`[BET RESOLUTION] Bet ${bet.id} resolved successfully`);
      } catch (error) {
        console.error(`[BET RESOLUTION] Failed to resolve bet ${bet.id}:`, error);
        failedBetIds.push(bet.id);
        
        try {
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'NEEDS_REVIEW' }
          });
          console.log(`[BET RESOLUTION] Bet ${bet.id} marked as NEEDS_REVIEW due to error`);
          
          await notifyBetNeedsReview(bet);
        } catch (updateError) {
          console.error(`[BET RESOLUTION] Failed to update bet ${bet.id} to NEEDS_REVIEW:`, updateError);
        }
      }
    }
    
    console.log(`[BET RESOLUTION] Completed bet resolution for game ${gameId}: ${processedBetIds.length} processed, ${failedBetIds.length} failed`);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30000
  });
}

async function cancelOpenBet(
  bet: Bet,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[BET RESOLUTION] Bet ${bet.id} is OPEN and not accepted, cancelling and refunding`);
  
  // Re-check bet status with optimistic locking
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    select: { id: true, status: true, stakeType: true, stakeCoins: true, creatorId: true, gameId: true, acceptedBy: true }
  });

  if (!currentBet) {
    console.log(`[BET RESOLUTION] Bet ${bet.id} no longer exists, skipping cancellation`);
    return;
  }

  if (currentBet.status !== 'OPEN' || currentBet.acceptedBy) {
    console.log(`[BET RESOLUTION] Bet ${bet.id} status changed to ${currentBet.status}, skipping cancellation`);
    return;
  }

  if (currentBet.stakeType === 'COINS' && currentBet.stakeCoins && currentBet.stakeCoins > 0) {
    console.log(`[BET RESOLUTION] Refunding ${currentBet.stakeCoins} coins to creator ${currentBet.creatorId} for bet ${bet.id}`);
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: currentBet.creatorId,
      transactionRows: [{
        name: `Bet cancelled (game finished) for game ${currentBet.gameId}`,
        price: currentBet.stakeCoins,
        qty: 1,
        total: currentBet.stakeCoins
      }]
    });
    console.log(`[BET RESOLUTION] Refund transaction created for bet ${bet.id}`);
  }

  const cancelledBet = await tx.bet.update({
    where: { id: bet.id },
    data: {
      status: 'CANCELLED',
      resolutionReason: 'Game finished before bet was accepted'
    }
  });

  console.log(`[BET RESOLUTION] Bet ${bet.id} cancelled successfully`);

  try {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emit('bet:updated', {
        gameId: bet.gameId,
        bet: cancelledBet
      });
      console.log(`[BET RESOLUTION] Socket event emitted for cancelled bet ${bet.id}`);
    }
  } catch (error) {
    console.error(`[BET RESOLUTION] Failed to emit bet updated event for bet ${bet.id}:`, error);
  }
}

async function resolveBetWithRetry(
  bet: Bet,
  evaluation: BetEvaluationResult,
  tx: Prisma.TransactionClient
): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await resolveBet(bet, evaluation, tx);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[BET RESOLUTION] Attempt ${attempt}/${MAX_RETRIES} failed for bet ${bet.id}:`, lastError);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`[BET RESOLUTION] Retrying bet ${bet.id} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`Failed to resolve bet ${bet.id} after ${MAX_RETRIES} attempts`);
}

async function resolveBet(
  bet: Bet,
  evaluation: BetEvaluationResult,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[BET RESOLUTION] Resolving bet ${bet.id} with evaluation: won=${evaluation.won}`);
  
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    include: { 
      creator: {
        select: USER_SELECT_FIELDS,
      }, 
      acceptedByUser: {
        select: USER_SELECT_FIELDS,
      }
    }
  });

  if (!currentBet) {
    throw new Error(`Bet ${bet.id} not found`);
  }

  if (currentBet.status === 'RESOLVED' || currentBet.status === 'CANCELLED') {
    console.log(`[BET RESOLUTION] Bet ${bet.id} already ${currentBet.status}, skipping (idempotency)`);
    return;
  }

  if (!currentBet.acceptedBy) {
    throw new Error(`Bet ${bet.id} cannot be resolved: not accepted`);
  }

  const winnerId = evaluation.won ? currentBet.creatorId : currentBet.acceptedBy;
  const loserId = evaluation.won ? currentBet.acceptedBy : currentBet.creatorId;
  
  console.log(`[BET RESOLUTION] Bet ${bet.id} winner: ${winnerId}, loser: ${loserId}`);

  const resolutionMetadata = {
    won: evaluation.won,
    reason: evaluation.reason,
    resolvedAt: new Date().toISOString(),
    stakeTransferred: false,
    rewardTransferred: false
  };

  const existingMetadata = (currentBet.metadata as any) || {};
  const existingResolution = existingMetadata.resolution || {};

  console.log(`[BET RESOLUTION] Updating bet ${bet.id} status to RESOLVED`);
  await tx.bet.update({
    where: { id: bet.id },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      winnerId,
      resolutionReason: evaluation.reason,
      metadata: {
        ...existingMetadata,
        resolution: {
          ...resolutionMetadata
        }
      }
    }
  });
  console.log(`[BET RESOLUTION] Bet ${bet.id} updated to RESOLVED status`);

  try {
    if (currentBet.stakeType === 'COINS' && currentBet.stakeCoins && currentBet.stakeCoins > 0 && !existingResolution.stakeTransferred) {
      console.log(`[BET RESOLUTION] Transferring stake coins ${currentBet.stakeCoins} to winner ${winnerId} for bet ${bet.id}`);
      await TransactionService.createTransaction({
        type: TransactionType.REFUND,
        toUserId: winnerId,
        transactionRows: [{
          name: `Bet stake won for game ${currentBet.gameId}`,
          price: currentBet.stakeCoins,
          qty: 1,
          total: currentBet.stakeCoins
        }]
      });
      console.log(`[BET RESOLUTION] Stake coins transaction created for bet ${bet.id}`);
      
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          metadata: {
            ...existingMetadata,
            resolution: {
              ...resolutionMetadata,
              stakeTransferred: true
            }
          }
        }
      });
    }

    if (currentBet.rewardType === 'COINS' && currentBet.rewardCoins && currentBet.rewardCoins > 0 && !existingResolution.rewardTransferred) {
      console.log(`[BET RESOLUTION] Transferring reward coins ${currentBet.rewardCoins} to winner ${winnerId} for bet ${bet.id}`);
      await TransactionService.createTransaction({
        type: TransactionType.REFUND,
        toUserId: winnerId,
        transactionRows: [{
          name: `Bet reward won for game ${currentBet.gameId}`,
          price: currentBet.rewardCoins,
          qty: 1,
          total: currentBet.rewardCoins
        }]
      });
      console.log(`[BET RESOLUTION] Reward coins transaction created for bet ${bet.id}`);
      
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          metadata: {
            ...existingMetadata,
            resolution: {
              ...resolutionMetadata,
              stakeTransferred: existingResolution.stakeTransferred || (currentBet.stakeType !== 'COINS'),
              rewardTransferred: true
            }
          }
        }
      });
    }
  } catch (coinError) {
    console.error(`[BET RESOLUTION] Failed to transfer coins for bet ${bet.id}:`, coinError);
    throw new Error(`Coin transfer failed for bet ${bet.id}: ${coinError instanceof Error ? coinError.message : String(coinError)}`);
  }

  // Calculate total coins won
  const totalCoinsWon = (currentBet.stakeType === 'COINS' ? (currentBet.stakeCoins || 0) : 0) + 
                        (currentBet.rewardType === 'COINS' ? (currentBet.rewardCoins || 0) : 0);

  // Emit socket event and send notifications (outside transaction)
  setImmediate(async () => {
    try {
      const socketService = (global as any).socketService;
      if (socketService) {
        await socketService.emit('bet:resolved', {
          gameId: bet.gameId,
          betId: bet.id,
          winnerId,
          loserId
        });
        console.log(`[BET RESOLUTION] Socket event emitted for resolved bet ${bet.id}`);
      }

      // Send notifications to winner and loser
      await notificationService.sendBetResolvedNotification(bet.id, winnerId, true, totalCoinsWon);
      await notificationService.sendBetResolvedNotification(bet.id, loserId, false);
      console.log(`[BET RESOLUTION] Notifications sent for resolved bet ${bet.id}`);
    } catch (error) {
      console.error(`[BET RESOLUTION] Failed to emit bet resolved event or send notifications for bet ${bet.id}:`, error);
    }
  });
}

async function notifyBetNeedsReview(bet: Bet): Promise<void> {
  try {
    const usersToNotify = [bet.creatorId];
    if (bet.acceptedBy) {
      usersToNotify.push(bet.acceptedBy);
    }

    for (const userId of usersToNotify) {
      await notificationService.sendBetNeedsReviewNotification(bet.id, userId);
    }
    console.log(`[BET RESOLUTION] Notifications sent for bet ${bet.id} needing review`);
  } catch (error) {
    console.error(`[BET RESOLUTION] Failed to send notifications for bet ${bet.id}:`, error);
  }
}
