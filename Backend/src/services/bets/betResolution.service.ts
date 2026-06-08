import prisma from '../../config/database';
import { Bet, TransactionType, Prisma } from '@prisma/client';
import { evaluateBetCondition, BetEvaluationResult } from './betConditionEvaluator.service';
import { shouldRouteCustomBetToNeedsReview, shouldVoidBetDueToMissingTarget } from './betResolutionRouting';
import { distributePoolCoins } from './poolCoinDistribution';
import { TransactionService } from '../transaction.service';
import notificationService from '../notification.service';
import { emitBetUpdated } from '../socketEmitFacade';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import {
  executeResolvedBetPayout,
  executeResolvedPoolBetPayout,
  initialPoolPayoutsByUser,
  retryBetPayout,
  type ResolvedBetPostTx,
  type ResolvedPoolBetPostTx,
} from './betResolutionPayout.service';

interface CancelledOpenBetPostTx {
  betId: string;
  gameId: string;
  creatorId: string;
  stakeCoins: number;
}

interface VoidedBetPostTx {
  betId: string;
  gameId: string;
  type: 'SOCIAL' | 'POOL';
  creatorId: string;
  acceptedBy: string | null;
  stakeType: string;
  stakeCoins: number | null;
  rewardType: string | null;
  rewardCoins: number | null;
  participantUserIds: string[];
  resolutionReason: string;
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
                sets: { orderBy: { setNumber: 'asc' } }
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
        },
        fixedTeams: {
          include: {
            players: { select: { userId: true } }
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
        creator: { select: USER_SELECT_FIELDS },
        acceptedByUser: { select: USER_SELECT_FIELDS },
        participants: { include: { user: { select: USER_SELECT_FIELDS } } }
      }
    });

    console.log(`[BET RESOLUTION] Found ${bets.length} bets to process for game ${gameId}`);

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
            teamBScore: set.teamBScore,
            role: set.role,
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
      })),
      fixedTeams: game.fixedTeams?.map(ft => ({
        id: ft.id,
        teamNumber: ft.teamNumber,
        playerIds: ft.players.map(p => p.userId)
      })) ?? []
    };

    const needsReviewBets: Bet[] = [];
    const cancelledOpenBets: CancelledOpenBetPostTx[] = [];
    const voidedBets: VoidedBetPostTx[] = [];
    const resolvedBets: ResolvedBetPostTx[] = [];
    const resolvedPoolBets: ResolvedPoolBetPostTx[] = [];

    for (const bet of bets) {
      try {
        console.log(`[BET RESOLUTION] Processing bet ${bet.id} (type: ${bet.type}, status: ${bet.status}, creator: ${bet.creatorId})`);

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

        if (bet.type !== 'POOL' && bet.status === 'OPEN' && !bet.acceptedBy) {
          const cancelled = await cancelOpenBet(bet, tx);
          if (cancelled) cancelledOpenBets.push(cancelled);
          continue;
        }

        console.log(`[BET RESOLUTION] Evaluating bet condition for bet ${bet.id}`);
        const result = await evaluateBetCondition(bet, gameResults);
        console.log(`[BET RESOLUTION] Bet ${bet.id} evaluation result: won=${result.won}, reason=${result.reason}`);

        if (shouldRouteCustomBetToNeedsReview(bet)) {
          await tx.bet.update({
            where: { id: bet.id },
            data: {
              status: 'NEEDS_REVIEW',
              resolutionReason: result.reason ?? 'Custom conditions require manual review'
            }
          });
          console.log(`[BET RESOLUTION] Bet ${bet.id} marked as NEEDS_REVIEW (custom condition)`);
          needsReviewBets.push(bet);
          continue;
        }

        if (shouldVoidBetDueToMissingTarget(result)) {
          const voided = await voidBetMissingTarget(bet, result, tx);
          if (voided) voidedBets.push(voided);
          console.log(`[BET RESOLUTION] Bet ${bet.id} voided (condition target absent)`);
          continue;
        }

        if (bet.type === 'POOL') {
          const poolResolved = await resolvePoolBet(bet, result, tx);
          if (poolResolved) resolvedPoolBets.push(poolResolved);
        } else {
          const resolved = await resolveBet(bet, result, tx);
          if (resolved) resolvedBets.push(resolved);
        }
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

    console.log(`[BET RESOLUTION] Completed bet resolution for game ${gameId}: ${resolvedBets.length + resolvedPoolBets.length + cancelledOpenBets.length + voidedBets.length} processed, ${needsReviewBets.length} need review`);
    return { needsReviewBets, cancelledOpenBets, voidedBets, resolvedBets, resolvedPoolBets };
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
  for (const v of postTx.voidedBets ?? []) {
    try {
      await runVoidedBetPostTx(v);
    } catch (err) {
      console.error(`[BET RESOLUTION] Failed post-tx for voided bet ${v.betId}:`, err);
    }
  }
  for (const r of postTx.resolvedBets) {
    executeResolvedBetPayout(r).catch(err => {
      console.error(`[BET RESOLUTION] Failed post-tx for resolved bet ${r.betId}:`, err);
      retryBetPayout(r.betId).catch(retryErr =>
        console.error(`[BET RESOLUTION] Immediate payout retry failed for bet ${r.betId}:`, retryErr)
      );
    });
  }
  for (const r of postTx.resolvedPoolBets ?? []) {
    executeResolvedPoolBetPayout(r).catch(err => {
      console.error(`[BET RESOLUTION] Failed post-tx for resolved pool bet ${r.betId}:`, err);
      retryBetPayout(r.betId).catch(retryErr =>
        console.error(`[BET RESOLUTION] Immediate payout retry failed for pool bet ${r.betId}:`, retryErr)
      );
    });
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
  const bet = await prisma.bet.findUnique({
    where: { id: c.betId },
    include: {
      creator: { select: USER_SELECT_FIELDS },
      acceptedByUser: { select: USER_SELECT_FIELDS },
      winner: { select: USER_SELECT_FIELDS }
    }
  });
  if (bet) {
    await emitBetUpdated(c.gameId, bet);
  }
}

async function voidBetMissingTarget(
  bet: Bet & { participants?: { userId: string }[] },
  result: BetEvaluationResult,
  tx: Prisma.TransactionClient
): Promise<VoidedBetPostTx | null> {
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    select: {
      id: true,
      status: true,
      type: true,
      gameId: true,
      creatorId: true,
      acceptedBy: true,
      stakeType: true,
      stakeCoins: true,
      rewardType: true,
      rewardCoins: true,
      participants: { select: { userId: true } },
    },
  });
  if (!currentBet || currentBet.status === 'RESOLVED' || currentBet.status === 'CANCELLED') {
    return null;
  }

  const resolutionReason = result.reason
    ? `Bet voided: ${result.reason}`
    : 'Bet voided: condition target did not participate in the game.';

  await tx.bet.update({
    where: { id: bet.id },
    data: { status: 'CANCELLED', resolutionReason },
  });

  return {
    betId: bet.id,
    gameId: currentBet.gameId,
    type: currentBet.type as 'SOCIAL' | 'POOL',
    creatorId: currentBet.creatorId,
    acceptedBy: currentBet.acceptedBy,
    stakeType: currentBet.stakeType,
    stakeCoins: currentBet.stakeCoins,
    rewardType: currentBet.rewardType,
    rewardCoins: currentBet.rewardCoins,
    participantUserIds: currentBet.participants.map(p => p.userId),
    resolutionReason,
  };
}

async function runVoidedBetPostTx(v: VoidedBetPostTx): Promise<void> {
  const stakeRefund =
    v.stakeType === 'COINS' && v.stakeCoins && v.stakeCoins > 0 ? v.stakeCoins : 0;

  if (v.type === 'POOL' && stakeRefund > 0) {
    for (const userId of v.participantUserIds) {
      await TransactionService.createTransaction({
        type: TransactionType.REFUND,
        toUserId: userId,
        transactionRows: [{
          name: `Bet voided (target absent) refund for game ${v.gameId}`,
          price: stakeRefund,
          qty: 1,
          total: stakeRefund,
        }],
      });
    }
  } else if (stakeRefund > 0) {
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: v.creatorId,
      transactionRows: [{
        name: `Bet voided (target absent) refund for game ${v.gameId}`,
        price: stakeRefund,
        qty: 1,
        total: stakeRefund,
      }],
    });
  }

  if (
    v.type !== 'POOL' &&
    v.acceptedBy &&
    v.rewardType === 'COINS' &&
    v.rewardCoins &&
    v.rewardCoins > 0
  ) {
    await TransactionService.createTransaction({
      type: TransactionType.REFUND,
      toUserId: v.acceptedBy,
      transactionRows: [{
        name: `Bet voided (target absent) refund for game ${v.gameId}`,
        price: v.rewardCoins,
        qty: 1,
        total: v.rewardCoins,
      }],
    });
  }

  const notifyUserIds = new Set<string>([v.creatorId, ...v.participantUserIds]);
  if (v.acceptedBy) notifyUserIds.add(v.acceptedBy);
  for (const uid of notifyUserIds) {
    await notificationService.sendBetCancelledNotification(v.betId, uid);
  }

  const bet = await prisma.bet.findUnique({
    where: { id: v.betId },
    include: {
      creator: { select: USER_SELECT_FIELDS },
      acceptedByUser: { select: USER_SELECT_FIELDS },
      winner: { select: USER_SELECT_FIELDS },
    },
  });
  if (bet) {
    await emitBetUpdated(v.gameId, bet);
  }
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

async function resolvePoolBet(
  bet: Bet & { participants: { userId: string; side: string }[]; poolTotalCoins: number | null },
  evaluation: BetEvaluationResult,
  tx: Prisma.TransactionClient
): Promise<ResolvedPoolBetPostTx | null> {
  const currentBet = await tx.bet.findUnique({
    where: { id: bet.id },
    select: { id: true, status: true, gameId: true, poolTotalCoins: true }
  });
  if (!currentBet || currentBet.status === 'RESOLVED' || currentBet.status === 'CANCELLED') {
    return null;
  }
  const poolTotalCoins = currentBet.poolTotalCoins ?? 0;
  const winningSide = evaluation.won ? 'WITH_CREATOR' : 'AGAINST_CREATOR';
  const winners = bet.participants.filter(p => p.side === winningSide).map(p => p.userId);
  const { sharePerWinner, winnerShares } = distributePoolCoins(poolTotalCoins, winners);
  const participantUserIds = bet.participants.map((p) => p.userId);

  const existingMetadata = (await tx.bet.findUnique({ where: { id: bet.id }, select: { metadata: true } }))?.metadata as Record<string, unknown> || {};
  await tx.bet.update({
    where: { id: bet.id },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolutionReason: evaluation.reason ?? undefined,
      metadata: {
        ...existingMetadata,
        resolution: {
          won: evaluation.won,
          reason: evaluation.reason,
          resolvedAt: new Date().toISOString(),
          winningSide,
          winnerIds: winners,
          poolTotalCoins,
          sharePerWinner,
          winnerShares,
          payoutsByUser: initialPoolPayoutsByUser(winners, participantUserIds),
        }
      }
    }
  });
  return {
    betId: bet.id,
    gameId: currentBet.gameId,
    winnerIds: winners,
    poolTotalCoins,
    sharePerWinner,
    winnerShares
  };
}

export async function gameHasPendingBetResolution(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { resultsStatus: true },
  });
  if (!game || game.resultsStatus !== 'FINAL') {
    return false;
  }
  const pendingCount = await prisma.bet.count({
    where: {
      gameId,
      status: { in: ['OPEN', 'ACCEPTED'] },
    },
  });
  return pendingCount > 0;
}

export type BetResolutionOrchestrationDeps = {
  gameHasPendingBetResolution: (gameId: string) => Promise<boolean>;
  resolveGameBets: (gameId: string) => Promise<void>;
};

const defaultOrchestrationDeps: BetResolutionOrchestrationDeps = {
  gameHasPendingBetResolution,
  resolveGameBets,
};

let orchestrationDeps: BetResolutionOrchestrationDeps = defaultOrchestrationDeps;

export function setBetResolutionOrchestrationDeps(
  deps: Partial<BetResolutionOrchestrationDeps> | null,
): void {
  orchestrationDeps = deps ? { ...defaultOrchestrationDeps, ...deps } : defaultOrchestrationDeps;
}

export async function attemptBetResolutionAfterOutcomesRecalc(
  gameId: string,
  shouldResolveBetsOnFinalize: boolean,
): Promise<void> {
  const hasPending = await orchestrationDeps.gameHasPendingBetResolution(gameId);
  if (!shouldResolveBetsOnFinalize && !hasPending) {
    return;
  }

  const reason = shouldResolveBetsOnFinalize
    ? 'results finalizing'
    : 'retry for unresolved bets on FINAL game';
  console.log(`[BET RESOLUTION] Triggering bet resolution for game ${gameId} (${reason})`);
  try {
    await orchestrationDeps.resolveGameBets(gameId);
    console.log(`[BET RESOLUTION] Bet resolution completed for game ${gameId}`);
  } catch (error) {
    console.error(`[BET RESOLUTION] Failed to resolve bets for game ${gameId}:`, error);
  }
}

export async function reconcilePendingGameBets(gameId: string): Promise<void> {
  await attemptBetResolutionAfterOutcomesRecalc(gameId, false);
}

async function notifyBetNeedsReview(bet: Bet & { participants?: { userId: string }[] }): Promise<void> {
  try {
    const usersToNotify = new Set<string>([bet.creatorId]);
    if (bet.acceptedBy) {
      usersToNotify.add(bet.acceptedBy);
    }
    if (bet.type === 'POOL' && bet.participants) {
      for (const p of bet.participants) {
        usersToNotify.add(p.userId);
      }
    }
    for (const userId of usersToNotify) {
      await notificationService.sendBetNeedsReviewNotification(bet.id, userId);
    }
    console.log(`[BET RESOLUTION] Notifications sent for bet ${bet.id} needing review`);
  } catch (error) {
    console.error(`[BET RESOLUTION] Failed to send notifications for bet ${bet.id}:`, error);
  }
}
