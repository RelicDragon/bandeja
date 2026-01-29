import prisma from '../../config/database';
import { Bet, TransactionType, Prisma } from '@prisma/client';
import { evaluateBetCondition, BetEvaluationResult } from './betConditionEvaluator.service';
import { TransactionService } from '../transaction.service';
import notificationService from '../notification.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

interface ResolvedBetPostTx {
  betId: string;
  gameId: string;
  winnerId: string;
  loserId: string;
  totalCoinsWon: number;
  stakeCoins: number | null;
  rewardCoins: number | null;
  stakeType: string;
  rewardType: string;
}

interface CancelledOpenBetPostTx {
  betId: string;
  gameId: string;
  creatorId: string;
  stakeCoins: number;
}

/**
 * Called when game resultsStatus changes to FINAL
 * Resolves all OPEN/ACCEPTED bets for the game
 */
export async function resolveGameBets(gameId: string): Promise<void> {
  console.log(`[BET RESOLUTION] Starting bet resolution for game ${gameId}`);

  const postTx = await prisma.$transaction(async (tx) => {
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
      return { needsReviewBets: [], cancelledOpenBets: [], resolvedBets: [] };
    }

    if (game.resultsStatus !== 'FINAL') {
      console.log(`[BET RESOLUTION] Game ${gameId} resultsStatus is ${game.resultsStatus}, not FINAL. Aborting bet resolution`);
      return { needsReviewBets: [], cancelledOpenBets: [], resolvedBets: [] };
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
        ties: outcome.ties,
        position: outcome.position ?? undefined
      }))
    };

    const needsReviewBets: Bet[] = [];
    const cancelledOpenBets: CancelledOpenBetPostTx[] = [];
    const resolvedBets: ResolvedBetPostTx[] = [];

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
          const cancelled = await cancelOpenBet(bet, tx);
          if (cancelled) cancelledOpenBets.push(cancelled);
          continue;
        }

        console.log(`[BET RESOLUTION] Evaluating bet condition for bet ${bet.id}`);
        const result = await evaluateBetCondition(bet, gameResults);
        console.log(`[BET RESOLUTION] Bet ${bet.id} evaluation result: won=${result.won}, reason=${result.reason}`);

        const resolved = await resolveBet(bet, result, tx);
        if (resolved) resolvedBets.push(resolved);
        console.log(`[BET RESOLUTION] Bet ${bet.id} resolved successfully`);
      } catch (error) {
        console.error(`[BET RESOLUTION] Failed to resolve bet ${bet.id}:`, error);

        try {
          await tx.bet.update({
            where: { id: bet.id },
            data: { status: 'NEEDS_REVIEW' }
          });
          console.log(`[BET RESOLUTION] Bet ${bet.id} marked as NEEDS_REVIEW due to error`);
          needsReviewBets.push(bet);
        } catch (updateError) {
          console.error(`[BET RESOLUTION] Failed to update bet ${bet.id} to NEEDS_REVIEW:`, updateError);
        }
      }
    }

    console.log(`[BET RESOLUTION] Completed bet resolution for game ${gameId}: ${resolvedBets.length + cancelledOpenBets.length} processed, ${needsReviewBets.length} need review`);
    return { needsReviewBets, cancelledOpenBets, resolvedBets };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30000
  });

  for (const bet of postTx.needsReviewBets) {
    notifyBetNeedsReview(bet).catch(err =>
      console.error(`[BET RESOLUTION] Failed to notify NEEDS_REVIEW for bet ${bet.id}:`, err)
    );
  }
  for (const c of postTx.cancelledOpenBets) {
    runCancelledOpenBetPostTx(c).catch(err =>
      console.error(`[BET RESOLUTION] Failed post-tx for cancelled open bet ${c.betId}:`, err)
    );
  }
  for (const r of postTx.resolvedBets) {
    runResolvedBetPostTx(r).catch(err =>
      console.error(`[BET RESOLUTION] Failed post-tx for resolved bet ${r.betId}:`, err)
    );
  }
}

async function runCancelledOpenBetPostTx(c: CancelledOpenBetPostTx): Promise<void> {
  if (c.stakeCoins > 0) {
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: c.creatorId,
      transactionRows: [{
        name: `Bet cancelled (game finished) for game ${c.gameId}`,
        price: c.stakeCoins,
        qty: 1,
        total: c.stakeCoins
      }]
    });
  }
  const socketService = (global as any).socketService;
  if (socketService) {
    const bet = await prisma.bet.findUnique({
      where: { id: c.betId },
      include: {
        creator: { select: USER_SELECT_FIELDS },
        acceptedByUser: { select: USER_SELECT_FIELDS },
        winner: { select: USER_SELECT_FIELDS }
      }
    });
    if (bet) {
      await socketService.emit('bet:updated', { gameId: c.gameId, bet });
    }
  }
}

async function runResolvedBetPostTx(r: ResolvedBetPostTx): Promise<void> {
  let existingMeta = (await prisma.bet.findUnique({ where: { id: r.betId }, select: { metadata: true } }))?.metadata as Record<string, unknown> | null;
  let resolution: Record<string, unknown> = { ...(existingMeta?.resolution as object || {}), stakeTransferred: false, rewardTransferred: false };

  if (r.stakeType === 'COINS' && r.stakeCoins && r.stakeCoins > 0) {
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: r.winnerId,
      transactionRows: [{
        name: `Bet stake won for game ${r.gameId}`,
        price: r.stakeCoins,
        qty: 1,
        total: r.stakeCoins
      }]
    });
    resolution = { ...resolution, stakeTransferred: true };
    existingMeta = { ...existingMeta, resolution };
    await prisma.bet.update({
      where: { id: r.betId },
      data: { metadata: existingMeta as object }
    });
  }
  if (r.rewardType === 'COINS' && r.rewardCoins && r.rewardCoins > 0) {
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: r.winnerId,
      transactionRows: [{
        name: `Bet reward won for game ${r.gameId}`,
        price: r.rewardCoins,
        qty: 1,
        total: r.rewardCoins
      }]
    });
    const metaAfterStake = (await prisma.bet.findUnique({ where: { id: r.betId }, select: { metadata: true } }))?.metadata as Record<string, unknown> | null;
    const resolutionAfterReward = { ...(metaAfterStake?.resolution as object || {}), rewardTransferred: true };
    await prisma.bet.update({
      where: { id: r.betId },
      data: { metadata: { ...metaAfterStake, resolution: resolutionAfterReward } as object }
    });
  }
  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emit('bet:resolved', { gameId: r.gameId, betId: r.betId, winnerId: r.winnerId, loserId: r.loserId });
  }
  await notificationService.sendBetResolvedNotification(r.betId, r.winnerId, true, r.totalCoinsWon);
  await notificationService.sendBetResolvedNotification(r.betId, r.loserId, false);
}

async function cancelOpenBet(
  bet: Bet,
  tx: Prisma.TransactionClient
): Promise<CancelledOpenBetPostTx | null> {
  console.log(`[BET RESOLUTION] Bet ${bet.id} is OPEN and not accepted, cancelling`);
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    select: { id: true, status: true, stakeType: true, stakeCoins: true, creatorId: true, gameId: true, acceptedBy: true }
  });

  if (!currentBet) {
    console.log(`[BET RESOLUTION] Bet ${bet.id} no longer exists, skipping cancellation`);
    return null;
  }

  if (currentBet.status !== 'OPEN' || currentBet.acceptedBy) {
    console.log(`[BET RESOLUTION] Bet ${bet.id} status changed to ${currentBet.status}, skipping cancellation`);
    return null;
  }

  await tx.bet.update({
    where: { id: bet.id },
    data: {
      status: 'CANCELLED',
      resolutionReason: 'Game finished before bet was accepted'
    }
  });
  console.log(`[BET RESOLUTION] Bet ${bet.id} cancelled successfully`);
  return {
    betId: bet.id,
    gameId: bet.gameId,
    creatorId: currentBet.creatorId,
    stakeCoins: currentBet.stakeType === 'COINS' && currentBet.stakeCoins ? currentBet.stakeCoins : 0
  };
}

async function resolveBet(
  bet: Bet,
  evaluation: BetEvaluationResult,
  tx: Prisma.TransactionClient
): Promise<ResolvedBetPostTx | null> {
  console.log(`[BET RESOLUTION] Resolving bet ${bet.id} with evaluation: won=${evaluation.won}`);
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    select: {
      id: true, status: true, gameId: true, creatorId: true, acceptedBy: true,
      stakeType: true, stakeCoins: true, rewardType: true, rewardCoins: true
    }
  });

  if (!currentBet) {
    throw new Error(`Bet ${bet.id} not found`);
  }

  if (currentBet.status === 'RESOLVED' || currentBet.status === 'CANCELLED') {
    console.log(`[BET RESOLUTION] Bet ${bet.id} already ${currentBet.status}, skipping (idempotency)`);
    return null;
  }

  if (!currentBet.acceptedBy) {
    throw new Error(`Bet ${bet.id} cannot be resolved: not accepted`);
  }

  const winnerId = evaluation.won ? currentBet.creatorId : currentBet.acceptedBy;
  const loserId = evaluation.won ? currentBet.acceptedBy : currentBet.creatorId;
  const totalCoinsWon = (currentBet.stakeType === 'COINS' ? (currentBet.stakeCoins || 0) : 0) +
    (currentBet.rewardType === 'COINS' ? (currentBet.rewardCoins || 0) : 0);

  const resolutionMetadata = {
    won: evaluation.won,
    reason: evaluation.reason,
    resolvedAt: new Date().toISOString(),
    stakeTransferred: false,
    rewardTransferred: false
  };

  const existingMetadata = (await tx.bet.findUnique({ where: { id: bet.id }, select: { metadata: true } }))?.metadata as Record<string, unknown> || {};

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
        resolution: resolutionMetadata
      }
    }
  });
  console.log(`[BET RESOLUTION] Bet ${bet.id} updated to RESOLVED status`);
  return {
    betId: bet.id,
    gameId: currentBet.gameId,
    winnerId,
    loserId,
    totalCoinsWon,
    stakeCoins: currentBet.stakeType === 'COINS' ? currentBet.stakeCoins : null,
    rewardCoins: currentBet.rewardType === 'COINS' ? currentBet.rewardCoins : null,
    stakeType: currentBet.stakeType,
    rewardType: currentBet.rewardType
  };
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
