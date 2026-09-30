import { Prisma, TransactionType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import notificationService from '../notification.service';

/**
 * Returning coins a player paid for a cost share that no longer exists.
 *
 * A share settled in coins moved real coins payer-ward (`createGuardedTransfer`).
 * When that share disappears — the player left or was kicked, the price was
 * removed, the game was deleted — the coins go back payer → player as a
 * `TRANSFER`. Never from the bank: the bank never held them, so paying from it
 * would mint coins.
 *
 * Deleting the share row **is** the claim: it is conditional on the
 * `transactionId` read in the same transaction, so two concurrent syncs, or a
 * sync racing a game delete, reverse a payment at most once. The payer's debit
 * is guarded (`wallet >= coins`); a payer who has spent the coins raises
 * {@link COIN_SHARE_UNREFUNDABLE} and the row survives for a later retry.
 */

export const COIN_SHARE_UNREFUNDABLE = 'errors.games.cannotDeleteCoinShareUnrefundable';

export interface CoinWalletEffect {
  transactionId: string;
  userId: string;
  isSender: boolean;
}

export async function reverseCoinShareInTx(
  tx: Prisma.TransactionClient,
  gameId: string,
  userId: string,
  gameLabel: string,
): Promise<CoinWalletEffect[]> {
  const row = await tx.gameCostShare.findUnique({
    where: { gameId_userId: { gameId, userId } },
    select: {
      id: true,
      method: true,
      transactionId: true,
      transaction: { select: { toUserId: true, total: true } },
    },
  });
  if (!row || row.method !== 'COINS' || row.transactionId == null) return [];

  const claim = await tx.gameCostShare.deleteMany({
    where: { id: row.id, transactionId: row.transactionId },
  });
  if (claim.count !== 1) return [];

  // The payer's account is gone (`SetNull`): there is nobody to reverse from.
  const payerId = row.transaction?.toUserId;
  const coins = Math.abs(row.transaction?.total ?? 0);
  if (!payerId || coins <= 0 || payerId === userId) return [];

  const debit = async () => {
    const debited = await tx.user.updateMany({
      where: { id: payerId, wallet: { gte: coins } },
      data: { wallet: { decrement: coins } },
    });
    if (debited.count !== 1) throw new ApiError(400, COIN_SHARE_UNREFUNDABLE);
  };
  const credit = () =>
    tx.user.update({ where: { id: userId }, data: { wallet: { increment: coins } } });
  // Same lock order as `createGuardedTransfer`: lower id first.
  if (payerId < userId) {
    await debit();
    await credit();
  } else {
    await credit();
    await debit();
  }

  const created = await tx.transaction.create({
    data: {
      type: TransactionType.TRANSFER,
      total: -coins,
      fromUserId: payerId,
      toUserId: userId,
      transactionRows: {
        create: [{ name: `Cost share refund: ${gameLabel}`, price: coins, qty: 1, total: coins }],
      },
    },
    select: { id: true },
  });
  return [
    { transactionId: created.id, userId: payerId, isSender: true },
    { transactionId: created.id, userId, isSender: false },
  ];
}

/**
 * Reverse coin-settled shares that dropped out of the split, one transaction
 * each so one payer short of coins does not hold up the others. Shares that
 * cannot be refunded yet are left in place (hidden from the tracker by the
 * sync) and retried on the next sync or the hourly cost sweep.
 */
export async function reverseOrphanedCoinShares(
  gameId: string,
  userIds: readonly string[],
  gameLabel: string,
): Promise<{ reversed: string[]; pending: string[] }> {
  const reversed: string[] = [];
  const pending: string[] = [];
  for (const userId of userIds) {
    try {
      const effects = await prisma.$transaction((tx) =>
        reverseCoinShareInTx(tx, gameId, userId, gameLabel),
      );
      if (effects.length > 0) reversed.push(userId);
      await deliverCoinWalletEffects(effects);
    } catch (error) {
      pending.push(userId);
      if (!(error instanceof ApiError && error.message === COIN_SHARE_UNREFUNDABLE)) {
        console.error('[CostShare] coin share reversal failed', gameId, userId, error);
      }
    }
  }
  return { reversed, pending };
}

/** Post-commit only: wallet sockets and transaction notifications. Never throws. */
export async function deliverCoinWalletEffects(effects: readonly CoinWalletEffect[]): Promise<void> {
  if (effects.length === 0) return;
  try {
    const socketService = (global as any).socketService;
    if (socketService?.emitWalletUpdate) {
      const userIds = [...new Set(effects.map((effect) => effect.userId))];
      const wallets = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, wallet: true },
      });
      for (const { id, wallet } of wallets) {
        await socketService.emitWalletUpdate(id, wallet);
      }
    }
    for (const effect of effects) {
      await notificationService.sendTransactionNotification(
        effect.transactionId,
        effect.userId,
        effect.isSender,
      );
    }
  } catch (error) {
    console.error('[CostShare] failed to deliver wallet effects', error);
  }
}
