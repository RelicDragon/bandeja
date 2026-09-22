import type { CostShareActorContext } from './costSharePermissions';
import type { GameCostSummaryDto } from './gameCost.types';

/** Keep the full counts, but disclose other players' shares only to collectors. */
export function projectCostSummary(
  summary: GameCostSummaryDto,
  ctx: CostShareActorContext,
): GameCostSummaryDto {
  // Old frozen ledgers may still contain a non-playing payer. Hide that extra
  // row without rewriting finalized amounts or any completed coin transfer.
  const playerShares = summary.shares.filter(
    (share) => !share.isPayer || ctx.playingUserIds.includes(share.userId),
  );
  const outstanding = playerShares.filter((share) => share.state !== 'SETTLED');
  const canSeeAllShares = summary.canManage || summary.canConfirm;
  const viewerShare = playerShares.find((share) => share.userId === ctx.userId) ?? null;

  return {
    ...summary,
    shares: canSeeAllShares ? playerShares : viewerShare ? [viewerShare] : [],
    viewerShare,
    shareCount: playerShares.length,
    settledCount: playerShares.length - outstanding.length,
    totalMinor: canSeeAllShares ? summary.totalMinor : null,
    outstandingMinor: canSeeAllShares
      ? outstanding.reduce((sum, share) => sum + share.amountMinor, 0)
      : null,
  };
}
