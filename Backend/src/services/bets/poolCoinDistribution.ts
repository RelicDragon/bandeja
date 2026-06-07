export interface PoolCoinDistribution {
  /** Floor share before remainder; all winners receive at least this amount. */
  sharePerWinner: number;
  /** Actual coins per winner; first N (by sorted userId) get sharePerWinner + 1 when remainder > 0. */
  winnerShares: Record<string, number>;
}

/**
 * Split pool coins among winners. Remainder coins (poolTotal % winnerCount) are assigned
 * one each to the first remainder winners in lexicographic userId order.
 */
export function distributePoolCoins(
  poolTotalCoins: number,
  winnerIds: string[],
): PoolCoinDistribution {
  if (winnerIds.length === 0) {
    return { sharePerWinner: 0, winnerShares: {} };
  }

  const sortedWinnerIds = [...winnerIds].sort((a, b) => a.localeCompare(b));
  const sharePerWinner = Math.floor(poolTotalCoins / sortedWinnerIds.length);
  const remainder = poolTotalCoins % sortedWinnerIds.length;

  const winnerShares: Record<string, number> = {};
  for (let i = 0; i < sortedWinnerIds.length; i++) {
    const extra = i < remainder ? 1 : 0;
    winnerShares[sortedWinnerIds[i]] = sharePerWinner + extra;
  }

  return { sharePerWinner, winnerShares };
}

export function totalDistributedShares(winnerShares: Record<string, number>): number {
  return Object.values(winnerShares).reduce((sum, n) => sum + n, 0);
}
