/**
 * PRD 355 — the atomic coin-spending primitive behind Buy and Gift.
 *
 * **Load-bearing invariant:** the wallet debit, the `Transaction` + row, and the
 * `UserGoods` insert all happen inside a single `prisma.$transaction`. If any
 * step fails the coins are not spent and the item is not granted. The
 * `UserGoods` unique index `(userId, goodsId)` is the idempotency key — a
 * double tap loses the race at the database, not at a `findFirst` check.
 *
 * **The debit is its own balance check.** Reading `wallet` and then
 * decrementing it is a check-then-act even inside a transaction: at READ
 * COMMITTED, N concurrent purchases of N *different* items each read the
 * pre-decrement balance and all commit, so the wallet goes negative and the
 * items are free. The authoritative gate is therefore a conditional
 * `UPDATE … WHERE wallet >= price`, which blocks on the buyer's row and
 * re-evaluates the predicate against the committed value. `rejectPurchase`'s
 * balance branch survives only to produce the friendly shortfall message.
 *
 * `TransactionService.createTransaction` cannot be reused here because it opens
 * its own transaction; the PURCHASE/REFUND semantics below are copied from it
 * deliberately (total is negated for PURCHASE, the bank is never debited).
 */
import { Prisma, TransactionType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import SocketService from '../socket.service';
import { isBlocked } from '../social-graph/socialGraph.block';
import { getOrCreateBandejaBank } from '../transaction.service';
import { rejectPurchase, SHOP_REJECTION_CODE, SHOP_REJECTION_STATUS } from './shopRules';
import type { ShopPurchaseRejection } from './shop.types';

export interface ShopPurchaseInput {
  goodsId: string;
  buyerUserId: string;
  /** Defaults to the buyer. When different, the purchase is a gift. */
  recipientUserId?: string | null;
}

export interface ShopPurchaseOutcome {
  goodsId: string;
  ownerUserId: string;
  buyerUserId: string;
  isGift: boolean;
  transactionId: string;
  buyerBalance: number;
  price: number;
  goodsName: string;
  stickerPackId: string | null;
}

export function shopRejectionError(rejection: ShopPurchaseRejection, data?: Record<string, unknown>): ApiError {
  return new ApiError(SHOP_REJECTION_STATUS[rejection], SHOP_REJECTION_CODE[rejection], true, {
    code: SHOP_REJECTION_CODE[rejection],
    reason: rejection,
    ...(data ?? {}),
  });
}

/**
 * Buy one catalogue item, optionally for somebody else.
 *
 * Everything that can reject is decided *inside* the transaction against freshly
 * read rows, so a concurrent price edit or a concurrent purchase cannot slip
 * through between the check and the write.
 */
export async function purchaseGoods(input: ShopPurchaseInput): Promise<ShopPurchaseOutcome> {
  const ownerUserId = input.recipientUserId ?? input.buyerUserId;
  const isGift = ownerUserId !== input.buyerUserId;

  // A gift is an unsolicited push carrying the sender's name, so it must honour
  // the block list in both directions. Answered as "no such recipient" rather
  // than "blocked", which would confirm the block to the sender.
  if (isGift && (await isBlocked(input.buyerUserId, ownerUserId))) {
    throw new ApiError(404, 'shop.recipientNotFound', true, { code: 'shop.recipientNotFound' });
  }

  const bank = await getOrCreateBandejaBank();

  const outcome = await prisma.$transaction(async (tx) => {
    const item = await tx.goods.findUnique({
      where: { id: input.goodsId },
      select: {
        id: true,
        name: true,
        price: true,
        isActive: true,
        premiumOnly: true,
        stickerPackId: true,
      },
    });
    if (!item) {
      throw shopRejectionError('NOT_AVAILABLE');
    }

    const [buyer, owner] = await Promise.all([
      tx.user.findUnique({ where: { id: input.buyerUserId }, select: { id: true, wallet: true } }),
      isGift
        ? tx.user.findUnique({
            where: { id: ownerUserId },
            select: { id: true, isPremium: true, isActive: true },
          })
        : tx.user.findUnique({
            where: { id: input.buyerUserId },
            select: { id: true, isPremium: true, isActive: true },
          }),
    ]);

    if (!buyer) {
      throw new ApiError(404, 'shop.buyerNotFound', true, { code: 'shop.buyerNotFound' });
    }
    if (!owner || !owner.isActive) {
      throw new ApiError(404, 'shop.recipientNotFound', true, { code: 'shop.recipientNotFound' });
    }

    const ownerAlreadyOwns =
      (await tx.userGoods.count({ where: { userId: ownerUserId, goodsId: item.id } })) > 0;

    const rejection = rejectPurchase({
      item,
      buyerUserId: buyer.id,
      buyerBalance: buyer.wallet,
      ownerUserId,
      ownerIsPremium: owner.isPremium,
      ownerAlreadyOwns,
    });
    if (rejection) {
      throw shopRejectionError(rejection, {
        price: item.price,
        balance: buyer.wallet,
        shortfall: Math.max(0, item.price - buyer.wallet),
      });
    }

    // The unique index is the real guard; `create` (not `upsert`) is what makes
    // a lost race surface as P2002 instead of silently succeeding twice.
    await tx.userGoods.create({
      data: {
        userId: ownerUserId,
        goodsId: item.id,
        giftedByUserId: isGift ? input.buyerUserId : null,
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        type: TransactionType.PURCHASE,
        // `createTransaction` negates PURCHASE totals; history renders the same way.
        total: -item.price,
        fromUserId: buyer.id,
        toUserId: bank.id,
        transactionRows: {
          create: [{ name: item.name, price: item.price, qty: 1, total: item.price, goodsId: item.id }],
        },
      },
      select: { id: true },
    });

    // The conditional predicate — not the `rejectPurchase` read above — is what
    // authorises the spend. A concurrent purchase of a *different* item blocks
    // here and then finds `wallet >= price` false, so it can never overdraw.
    const debited = await tx.user.updateMany({
      where: { id: buyer.id, wallet: { gte: item.price } },
      data: { wallet: { decrement: item.price } },
    });
    if (debited.count !== 1) {
      const fresh = await tx.user.findUnique({
        where: { id: buyer.id },
        select: { wallet: true },
      });
      const balance = fresh?.wallet ?? buyer.wallet;
      throw shopRejectionError('INSUFFICIENT_FUNDS', {
        price: item.price,
        balance,
        shortfall: Math.max(0, item.price - balance),
      });
    }
    const buyerAfter = await tx.user.findUniqueOrThrow({
      where: { id: buyer.id },
      select: { wallet: true },
    });
    // The bank is credited but never debited, exactly as in `createTransaction`.
    await tx.user.update({
      where: { id: bank.id },
      data: { wallet: { increment: item.price } },
      select: { id: true },
    });

    return {
      goodsId: item.id,
      ownerUserId,
      buyerUserId: buyer.id,
      isGift,
      transactionId: transaction.id,
      buyerBalance: buyerAfter.wallet,
      price: item.price,
      goodsName: item.name,
      stickerPackId: item.stickerPackId,
    } satisfies ShopPurchaseOutcome;
  });

  // The coins are already spent; a socket hiccup must not turn a settled
  // purchase into an error the client will retry.
  try {
    const socketService = (globalThis as unknown as { socketService?: SocketService }).socketService;
    if (socketService) {
      await socketService.emitWalletUpdate(outcome.buyerUserId, outcome.buyerBalance, bank.id);
    }
  } catch (error) {
    console.error('[purchaseGoods] Wallet update emit failed:', error);
  }

  return outcome;
}

/**
 * How many times a withdrawal re-reads the owner list. Two is enough to catch a
 * purchase that committed while the first pass was running; the bound keeps a
 * pathological buy-loop from holding the admin request open.
 */
const REFUND_PASSES = 2;

export interface ShopRefundOutcome {
  refundedUserIds: string[];
  skippedUserIds: string[];
  refundPerOwner: number;
  totalRefund: number;
}

/**
 * Refund every owner of a withdrawn item **exactly once**, then remove the
 * ownership rows (which also clears any equipped state).
 *
 * Idempotency is **per ownership instance**, not per `(user, goods)` lifetime.
 * The old rule — "this user already holds a REFUND row for this goods id" —
 * was a lifetime check, so a player who bought an item, was refunded when it
 * was withdrawn, and then bought it again after an admin re-activated it lost
 * the second purchase price: the ownership row was destroyed and the payout
 * skipped.
 *
 * The claim is now the `deleteMany` on the ownership row itself. Deleting it is
 * what earns the right to pay: a concurrent withdraw blocks on that row lock,
 * then deletes nothing and stops. Because the delete and the payout commit in
 * the same transaction, ownership is only ever destroyed when the matching
 * refund lands, and a failed payout restores it. Each owner settles in its own
 * transaction so one bad row cannot strand the rest.
 */
export async function refundGoodsOwners(goodsId: string, priceOverride?: number): Promise<ShopRefundOutcome> {
  const item = await prisma.goods.findUnique({
    where: { id: goodsId },
    select: { id: true, name: true, price: true },
  });
  if (!item) {
    throw new ApiError(404, 'shop.itemNotAvailable', true, { code: 'shop.itemNotAvailable' });
  }
  const refundPerOwner = priceOverride ?? item.price;
  const bank = await getOrCreateBandejaBank();

  const refundedUserIds: string[] = [];
  const skippedUserIds: string[] = [];

  // Re-read between passes: a purchase that committed just as the admin
  // deactivated the item would otherwise keep the coins *and* lose the item.
  // Every pass deletes the rows it saw, so the set strictly shrinks.
  for (let pass = 0; pass < REFUND_PASSES; pass += 1) {
    const owners = await prisma.userGoods.findMany({
      where: { goodsId },
      select: { id: true, userId: true },
      orderBy: { id: 'asc' },
    });
    if (owners.length === 0) break;

    for (const owner of owners) {
      const settled = await prisma.$transaction(async (tx) => {
        // Claim this ownership instance. `deleteMany` (not `delete`) so losing
        // the race is a count of 0 rather than a thrown P2025, and so the
        // predicate is re-evaluated against the committed row after the lock
        // is released.
        const claimed = await tx.userGoods.deleteMany({ where: { id: owner.id } });
        if (claimed.count !== 1) return false;

        // A free item has nothing to pay back; ownership still goes.
        if (refundPerOwner <= 0) return false;

        await tx.transaction.create({
          data: {
            type: TransactionType.REFUND,
            total: refundPerOwner,
            fromUserId: bank.id,
            toUserId: owner.userId,
            transactionRows: {
              create: [
                { name: item.name, price: refundPerOwner, qty: 1, total: refundPerOwner, goodsId },
              ],
            },
          },
          select: { id: true },
        });
        await tx.user.update({
          where: { id: owner.userId },
          data: { wallet: { increment: refundPerOwner } },
          select: { id: true },
        });
        return true;
      });

      if (settled) refundedUserIds.push(owner.userId);
      else skippedUserIds.push(owner.userId);
    }
  }

  // Every refund above is committed; a failed emit must not fail the withdraw.
  try {
    const socketService = (globalThis as unknown as { socketService?: SocketService }).socketService;
    if (socketService) {
      for (const userId of refundedUserIds) {
        const fresh = await prisma.user.findUnique({
          where: { id: userId },
          select: { wallet: true },
        });
        if (fresh) await socketService.emitWalletUpdate(userId, fresh.wallet, bank.id);
      }
    }
  } catch (error) {
    console.error('[refundGoodsOwners] Wallet update emit failed:', error);
  }

  return {
    refundedUserIds,
    skippedUserIds,
    refundPerOwner,
    totalRefund: refundPerOwner * refundedUserIds.length,
  };
}

/** `P2002` on `UserGoods` means somebody else won the double-tap race. */
export function isDuplicateOwnershipError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
