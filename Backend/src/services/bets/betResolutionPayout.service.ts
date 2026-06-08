import prisma from '../../config/database';
import { Bet, TransactionType } from '@prisma/client';
import { TransactionService } from '../transaction.service';
import notificationService from '../notification.service';
import { emitBetResolvedPool, emitBetResolvedSocial } from '../socketEmitFacade';

export interface ResolvedBetPostTx {
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

export interface ResolvedPoolBetPostTx {
  betId: string;
  gameId: string;
  winnerIds: string[];
  poolTotalCoins: number;
  sharePerWinner: number;
  winnerShares: Record<string, number>;
}

type BetResolutionMeta = {
  won?: boolean;
  reason?: string;
  resolvedAt?: string;
  stakeTransferred?: boolean;
  rewardTransferred?: boolean;
  winningSide?: string;
  winnerIds?: string[];
  poolTotalCoins?: number;
  sharePerWinner?: number;
  winnerShares?: Record<string, number>;
  payoutsByUser?: Record<string, boolean>;
  lastPayoutError?: string;
  lastPayoutAttemptAt?: string;
};

type BetMetadata = {
  resolution?: BetResolutionMeta;
};

type PayoutDeps = {
  createTransaction: typeof TransactionService.createTransaction;
  sendBetResolvedNotification: typeof notificationService.sendBetResolvedNotification;
};

const defaultDeps: PayoutDeps = {
  createTransaction: TransactionService.createTransaction.bind(TransactionService),
  sendBetResolvedNotification: notificationService.sendBetResolvedNotification.bind(notificationService),
};

let payoutDeps: PayoutDeps = { ...defaultDeps };

export function setBetPayoutTestDeps(overrides: Partial<PayoutDeps>): void {
  payoutDeps = { ...defaultDeps, ...overrides };
}

export function resetBetPayoutTestDeps(): void {
  payoutDeps = { ...defaultDeps };
}

function getResolution(metadata: unknown): BetResolutionMeta {
  return ((metadata as BetMetadata | null)?.resolution) ?? {};
}

async function patchResolution(betId: string, patch: Partial<BetResolutionMeta>): Promise<BetResolutionMeta> {
  const existingMeta = (await prisma.bet.findUnique({ where: { id: betId }, select: { metadata: true } }))?.metadata as BetMetadata | null;
  const resolution = { ...getResolution(existingMeta), ...patch };
  await prisma.bet.update({
    where: { id: betId },
    data: { metadata: { ...existingMeta, resolution } as object },
  });
  return resolution;
}

async function markPayoutFailure(betId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await patchResolution(betId, {
    lastPayoutError: message,
    lastPayoutAttemptAt: new Date().toISOString(),
  });
  console.error(`[BET PAYOUT] Failed payout for bet ${betId}:`, err);
}

function winnerShareAmount(resolution: BetResolutionMeta, winnerId: string): number {
  return resolution.winnerShares?.[winnerId] ?? resolution.sharePerWinner ?? 0;
}

export function socialBetNeedsPayout(bet: Pick<Bet, 'stakeType' | 'stakeCoins' | 'rewardType' | 'rewardCoins' | 'metadata'>): boolean {
  const resolution = getResolution(bet.metadata);
  const stakeDue = bet.stakeType === 'COINS' && (bet.stakeCoins ?? 0) > 0;
  const rewardDue = bet.rewardType === 'COINS' && (bet.rewardCoins ?? 0) > 0;
  if (stakeDue && resolution.stakeTransferred !== true) return true;
  if (rewardDue && resolution.rewardTransferred !== true) return true;
  return false;
}

export function poolBetNeedsPayout(
  bet: Pick<Bet, 'stakeCoins' | 'metadata'>,
  participantUserIds: string[],
): boolean {
  const resolution = getResolution(bet.metadata);
  const payoutsByUser = resolution.payoutsByUser ?? {};
  const winnerIds = resolution.winnerIds ?? [];
  const stakeCoins = bet.stakeCoins ?? 0;

  if (winnerIds.length === 0) {
    if (stakeCoins <= 0) return false;
    return participantUserIds.some((userId) => payoutsByUser[userId] !== true);
  }

  return winnerIds.some((userId) => {
    if (payoutsByUser[userId] === true) return false;
    return winnerShareAmount(resolution, userId) > 0;
  });
}

export function buildSocialPayoutPayload(
  bet: Pick<
    Bet,
    'id' | 'gameId' | 'creatorId' | 'acceptedBy' | 'winnerId' | 'stakeType' | 'stakeCoins' | 'rewardType' | 'rewardCoins'
  >,
): ResolvedBetPostTx | null {
  if (!bet.acceptedBy || !bet.winnerId) return null;
  const loserId = bet.winnerId === bet.creatorId ? bet.acceptedBy : bet.creatorId;
  const totalCoinsWon =
    (bet.stakeType === 'COINS' ? (bet.stakeCoins ?? 0) : 0) +
    (bet.rewardType === 'COINS' ? (bet.rewardCoins ?? 0) : 0);
  return {
    betId: bet.id,
    gameId: bet.gameId,
    winnerId: bet.winnerId,
    loserId,
    totalCoinsWon,
    stakeCoins: bet.stakeType === 'COINS' ? bet.stakeCoins : null,
    rewardCoins: bet.rewardType === 'COINS' ? bet.rewardCoins : null,
    stakeType: bet.stakeType,
    rewardType: bet.rewardType,
  };
}

export function buildPoolPayoutPayload(
  bet: Pick<Bet, 'id' | 'gameId' | 'metadata'>,
): ResolvedPoolBetPostTx | null {
  const resolution = getResolution(bet.metadata);
  const winnerIds = resolution.winnerIds ?? [];
  const poolTotalCoins = resolution.poolTotalCoins ?? 0;
  const sharePerWinner = resolution.sharePerWinner ?? 0;
  const winnerShares = resolution.winnerShares ?? {};
  return {
    betId: bet.id,
    gameId: bet.gameId,
    winnerIds,
    poolTotalCoins,
    sharePerWinner,
    winnerShares,
  };
}

export async function executeResolvedBetPayout(r: ResolvedBetPostTx): Promise<void> {
  const bet = await prisma.bet.findUnique({
    where: { id: r.betId },
    select: { metadata: true },
  });
  if (!bet) return;

  const resolution = getResolution(bet.metadata);
  let stakeTransferred = resolution.stakeTransferred === true;
  let rewardTransferred = resolution.rewardTransferred === true;
  let paidAny = false;

  try {
    if (r.stakeType === 'COINS' && r.stakeCoins && r.stakeCoins > 0 && !stakeTransferred) {
      await payoutDeps.createTransaction({
        type: TransactionType.REFUND,
        toUserId: r.winnerId,
        transactionRows: [{
          name: `Bet stake won for game ${r.gameId}`,
          price: r.stakeCoins,
          qty: 1,
          total: r.stakeCoins,
        }],
      });
      stakeTransferred = true;
      paidAny = true;
      await patchResolution(r.betId, { stakeTransferred: true });
    }

    if (r.rewardType === 'COINS' && r.rewardCoins && r.rewardCoins > 0 && !rewardTransferred) {
      await payoutDeps.createTransaction({
        type: TransactionType.REFUND,
        toUserId: r.winnerId,
        transactionRows: [{
          name: `Bet reward won for game ${r.gameId}`,
          price: r.rewardCoins,
          qty: 1,
          total: r.rewardCoins,
        }],
      });
      rewardTransferred = true;
      paidAny = true;
      await patchResolution(r.betId, { rewardTransferred: true });
    }

    if (paidAny) {
      await patchResolution(r.betId, { lastPayoutError: undefined, lastPayoutAttemptAt: new Date().toISOString() });
    }
  } catch (err) {
    await markPayoutFailure(r.betId, err);
    throw err;
  }

  if (paidAny) {
    await emitBetResolvedSocial(r.gameId, r.betId, r.winnerId, r.loserId);
  }
  if (paidAny) {
    await payoutDeps.sendBetResolvedNotification(r.betId, r.winnerId, true, r.totalCoinsWon);
    await payoutDeps.sendBetResolvedNotification(r.betId, r.loserId, false);
  }
}

export async function executeResolvedPoolBetPayout(r: ResolvedPoolBetPostTx): Promise<void> {
  const bet = await prisma.bet.findUnique({
    where: { id: r.betId },
    select: {
      metadata: true,
      stakeCoins: true,
      participants: { select: { userId: true } },
    },
  });
  if (!bet) return;

  const resolution = getResolution(bet.metadata);
  const payoutsByUser = { ...(resolution.payoutsByUser ?? {}) };
  const newlyPaidUserIds: string[] = [];

  try {
    if (r.winnerIds.length === 0 && (bet.stakeCoins ?? 0) > 0) {
      for (const p of bet.participants) {
        if (payoutsByUser[p.userId] === true) continue;
        await payoutDeps.createTransaction({
          type: TransactionType.REFUND,
          toUserId: p.userId,
          transactionRows: [{
            name: `Pool bet refund (no winners) for game ${r.gameId}`,
            price: bet.stakeCoins!,
            qty: 1,
            total: bet.stakeCoins!,
          }],
        });
        payoutsByUser[p.userId] = true;
        newlyPaidUserIds.push(p.userId);
        await patchResolution(r.betId, { payoutsByUser: { ...payoutsByUser } });
      }
    } else {
      for (const winnerId of r.winnerIds) {
        if (payoutsByUser[winnerId] === true) continue;
        const share = r.winnerShares[winnerId] ?? 0;
        if (share > 0) {
          await payoutDeps.createTransaction({
            type: TransactionType.REFUND,
            toUserId: winnerId,
            transactionRows: [{
              name: `Pool bet share won for game ${r.gameId}`,
              price: share,
              qty: 1,
              total: share,
            }],
          });
        }
        payoutsByUser[winnerId] = true;
        newlyPaidUserIds.push(winnerId);
        await patchResolution(r.betId, { payoutsByUser: { ...payoutsByUser } });
      }
    }

    if (newlyPaidUserIds.length > 0) {
      await patchResolution(r.betId, { lastPayoutError: undefined, lastPayoutAttemptAt: new Date().toISOString() });
    }
  } catch (err) {
    await markPayoutFailure(r.betId, err);
    throw err;
  }

  for (const userId of newlyPaidUserIds) {
    const isWinner = r.winnerIds.includes(userId);
    const share = isWinner ? (r.winnerShares[userId] ?? 0) : undefined;
    await payoutDeps.sendBetResolvedNotification(r.betId, userId, isWinner, share);
  }
  if (newlyPaidUserIds.length > 0 && r.winnerIds.length > 0) {
    const loserIds = bet.participants.filter((p) => !r.winnerIds.includes(p.userId)).map((p) => p.userId);
    for (const loserId of loserIds) {
      await payoutDeps.sendBetResolvedNotification(r.betId, loserId, false);
    }
  }

  if (newlyPaidUserIds.length > 0) {
    await emitBetResolvedPool(
      r.gameId,
      r.betId,
      r.winnerIds,
      r.sharePerWinner,
      r.winnerShares
    );
  }
}

export async function retryBetPayout(betId: string): Promise<boolean> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { participants: { select: { userId: true } } },
  });
  if (!bet || bet.status !== 'RESOLVED') return false;

  if (bet.type === 'POOL') {
    if (!poolBetNeedsPayout(bet, bet.participants.map((p) => p.userId))) return false;
    const payload = buildPoolPayoutPayload(bet);
    if (!payload) return false;
    await executeResolvedPoolBetPayout(payload);
    return true;
  }

  if (!socialBetNeedsPayout(bet)) return false;
  const payload = buildSocialPayoutPayload(bet);
  if (!payload) return false;
  await executeResolvedBetPayout(payload);
  return true;
}

export async function reconcileUnresolvedBetPayouts(limit = 50): Promise<{ retried: number; failed: number }> {
  let retried = 0;
  let failed = 0;
  let offset = 0;
  const batchSize = 100;

  while (retried < limit) {
    const bets = await prisma.bet.findMany({
      where: { status: 'RESOLVED' },
      include: { participants: { select: { userId: true } } },
      orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: batchSize,
    });
    if (bets.length === 0) break;
    offset += bets.length;

    for (const bet of bets) {
      const needs =
        bet.type === 'POOL'
          ? poolBetNeedsPayout(bet, bet.participants.map((p) => p.userId))
          : socialBetNeedsPayout(bet);
      if (!needs) continue;

      try {
        const didRetry = await retryBetPayout(bet.id);
        if (didRetry) retried++;
        if (retried >= limit) break;
      } catch (err) {
        failed++;
        console.error(`[BET PAYOUT RECONCILE] Retry failed for bet ${bet.id}:`, err);
      }
    }

    if (bets.length < batchSize) break;
  }

  if (failed > 0) {
    console.error(`[BET PAYOUT RECONCILE] ${failed} bet payout(s) still failing after retry`);
  }

  return { retried, failed };
}

export function initialPoolPayoutsByUser(winnerIds: string[], participantUserIds: string[]): Record<string, boolean> {
  const userIds = winnerIds.length > 0 ? winnerIds : participantUserIds;
  return Object.fromEntries(userIds.map((userId) => [userId, false]));
}
