import type { Bet } from '@prisma/client';

/**
 * Pure payout-state reads over `Bet.metadata.resolution`. Kept free of service
 * imports so callers inside other transactions (game delete) can use them
 * without pulling in `TransactionService` and its import cycle.
 */

export type BetResolutionMeta = {
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

export type BetMetadata = {
  resolution?: BetResolutionMeta;
};

export function getResolution(metadata: unknown): BetResolutionMeta {
  return ((metadata as BetMetadata | null)?.resolution) ?? {};
}

export function winnerShareAmount(resolution: BetResolutionMeta, winnerId: string): number {
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
