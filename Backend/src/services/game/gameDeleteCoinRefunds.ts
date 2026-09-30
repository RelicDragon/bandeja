import { Prisma, TransactionType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { getOrCreateBandejaBank } from '../transaction.service';
import { poolBetNeedsPayout, socialBetNeedsPayout } from '../bets/betPayoutState';
import { reverseCoinShareInTx, type CoinWalletEffect } from '../gameCost/coinShareReversal';

/**
 * Coins held against a game must come back before the game is hard-deleted:
 * `Bet` and `GameCostShare` cascade with it, so anything not returned here is
 * lost for good — nothing is left for a reconcile job to find.
 *
 * Runs **inside** the delete transaction, so the refunds, the bet claims and
 * the delete commit or roll back as one:
 *
 * - `OPEN` / `ACCEPTED` / `NEEDS_REVIEW` bets are claimed (conditional status
 *   flip to `CANCELLED`) and refunded from the bank exactly like
 *   `BetService.cancelBet`: SOCIAL stake → creator, accepted SOCIAL reward →
 *   acceptor, every POOL entry → its participant. A bet another path already
 *   cancelled loses the claim and is not refunded twice.
 * - A `RESOLVED` bet whose payout has not landed (results were reset after a
 *   failed payout) refuses the delete: the payout reconciler needs the row.
 * - A cost share settled in coins is reversed payer → player
 *   (`reverseCoinShareInTx`). A payer who can no longer cover it refuses the
 *   delete; the payer is never overdrawn.
 */

const HELD_BET_STATUSES = ['OPEN', 'ACCEPTED', 'NEEDS_REVIEW'] as const;

export async function refundCoinsHeldByGame(
  tx: Prisma.TransactionClient,
  gameId: string,
  gameName: string | null,
): Promise<CoinWalletEffect[]> {
  const effects: CoinWalletEffect[] = [];
  const label = gameName?.trim() || gameId;

  // Lock the ledger first. A coin settle locks its share row before touching
  // any wallet and stamps it in the same transaction, so after this either its
  // stamp has committed (and the reversal below sees it) or it will find the
  // row gone and roll its transfer back. Share → users is the lock order
  // everywhere.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "GameCostShare" WHERE "gameId" = ${gameId} FOR UPDATE`,
  );

  const resolved = await tx.bet.findMany({
    where: { gameId, status: 'RESOLVED' },
    include: { participants: { select: { userId: true } } },
  });
  const payoutPending = resolved.some((bet) =>
    bet.type === 'POOL'
      ? poolBetNeedsPayout(bet, bet.participants.map((p) => p.userId))
      : socialBetNeedsPayout(bet),
  );
  if (payoutPending) {
    throw new ApiError(400, 'errors.games.cannotDeletePendingBetPayout');
  }

  const held = await tx.bet.findMany({
    where: { gameId, status: { in: [...HELD_BET_STATUSES] } },
    select: { id: true, status: true },
  });

  let bankId: string | null = null;
  const refund = async (toUserId: string, coins: number, name: string) => {
    bankId ??= (await getOrCreateBandejaBank()).id;
    const created = await tx.transaction.create({
      data: {
        type: TransactionType.REFUND,
        total: coins,
        fromUserId: bankId,
        toUserId,
        transactionRows: { create: [{ name, price: coins, qty: 1, total: coins }] },
      },
      select: { id: true },
    });
    await tx.user.update({ where: { id: toUserId }, data: { wallet: { increment: coins } } });
    effects.push({ transactionId: created.id, userId: toUserId, isSender: false });
  };

  for (const { id, status } of held) {
    const claim = await tx.bet.updateMany({
      where: { id, status },
      data: { status: 'CANCELLED', resolutionReason: 'Game cancelled' },
    });
    if (claim.count !== 1) continue;

    // Re-read after the claim: the row lock orders us after any pool join.
    const bet = await tx.bet.findUniqueOrThrow({
      where: { id },
      include: { participants: { select: { userId: true } } },
    });
    const name = `Game cancelled refund for game ${label}`;
    const stakeCoins = bet.stakeType === 'COINS' && bet.stakeCoins ? bet.stakeCoins : 0;

    if (bet.type === 'POOL') {
      if (stakeCoins > 0) {
        for (const participant of bet.participants) {
          await refund(participant.userId, stakeCoins, name);
        }
      }
      continue;
    }
    if (stakeCoins > 0) {
      await refund(bet.creatorId, stakeCoins, name);
    }
    if (bet.acceptedBy && bet.rewardType === 'COINS' && bet.rewardCoins && bet.rewardCoins > 0) {
      await refund(bet.acceptedBy, bet.rewardCoins, name);
    }
  }

  const coinShares = await tx.gameCostShare.findMany({
    where: { gameId, method: 'COINS', transactionId: { not: null } },
    select: { userId: true },
  });
  for (const share of coinShares) {
    effects.push(...(await reverseCoinShareInTx(tx, gameId, share.userId, label)));
  }

  return effects;
}
