import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { TransactionType } from '@prisma/client';
import SocketService from './socket.service';
import notificationService from './notification.service';
import { USER_SELECT_FIELDS, USER_SELECT_WITH_SPORT_PROFILES } from '../utils/constants';
import { projectTransactionEmbeddedUsers } from './user/projectEmbeddedBasicUsers';

const BANDEJA_BANK_IDENTIFIER = 'BANDEJA_BANK';

/**
 * PRD 355 — the shop settles its own PURCHASE/REFUND rows inside one
 * `prisma.$transaction` together with the `UserGoods` write, so it needs the
 * bank account without going through `createTransaction` (which opens its own
 * transaction). Exported for that single reason; nothing else should call it.
 */
export async function getOrCreateBandejaBank() {
  let bandejaBank = await prisma.user.findFirst({
    where: {
      phone: BANDEJA_BANK_IDENTIFIER,
    },
  });

  if (!bandejaBank) {
    bandejaBank = await prisma.user.create({
      data: {
        phone: BANDEJA_BANK_IDENTIFIER,
        email: 'bandejabank@system',
        firstName: 'BandejaBank',
        lastName: 'System',
        isActive: true,
        wallet: 0,
      },
    });
  }

  return bandejaBank;
}

interface TransactionRowInput {
  name: string;
  price: number;
  qty: number;
  total?: number;
  goodsId?: string | null;
}

interface CreateTransactionInput {
  type: TransactionType;
  transactionRows: TransactionRowInput[];
  fromUserId?: string | null;
  toUserId?: string | null;
}

export interface GuardedTransferInput {
  fromUserId: string;
  toUserId: string;
  /** Priced from server-side data only — never from a request body. */
  transactionRows: TransactionRowInput[];
}

export interface GuardedTransferResult {
  id: string;
  total: number;
  fromWallet: number;
  toWallet: number;
}

function sumTransactionRows(transactionRows: TransactionRowInput[]): number {
  if (!transactionRows || transactionRows.length === 0) {
    throw new ApiError(400, 'Transaction must have at least one row');
  }
  return transactionRows.reduce((sum, row) => {
    const rowTotal = row.price * row.qty;
    if (row.total !== undefined && row.total !== rowTotal) {
      throw new ApiError(400, `Row total mismatch: expected ${rowTotal}, got ${row.total}`);
    }
    return sum + rowTotal;
  }, 0);
}

/**
 * PRD 348 — a P2P coin `TRANSFER` whose balance check **is** the debit.
 *
 * {@link TransactionService.createTransaction} reads the sender's wallet
 * *outside* its own `$transaction` and then decrements unconditionally, so two
 * concurrent spends by the same user can both pass the check and drive the
 * wallet negative. That path is shared with bets, the marketplace and admin
 * grants and is deliberately left exactly as it is; this narrowly-scoped
 * sibling exists for the cost-split settle path, which must not overdraw.
 *
 * The authorisation is a conditional `UPDATE … WHERE wallet >= total`: at READ
 * COMMITTED a concurrent debit of the same row blocks on the row lock and then
 * re-evaluates the predicate against the committed value, so the loser updates
 * nothing and its whole transfer rolls back. The two wallet writes are ordered
 * by user id so two people paying each other at the same instant cannot
 * deadlock.
 */
export async function createGuardedTransfer(
  input: GuardedTransferInput,
): Promise<GuardedTransferResult> {
  const { fromUserId, toUserId, transactionRows } = input;
  if (!fromUserId || !toUserId) {
    throw new ApiError(400, 'Transfer requires both fromUserId and toUserId');
  }
  if (fromUserId === toUserId) {
    throw new ApiError(400, 'Cannot transfer to yourself');
  }

  const total = sumTransactionRows(transactionRows);
  if (!Number.isInteger(total) || total <= 0) {
    throw new ApiError(400, 'Transfer amount must be a positive whole number of coins');
  }

  const settled = await prisma.$transaction(async (tx) => {
    const debit = async (): Promise<number> => {
      const debited = await tx.user.updateMany({
        where: { id: fromUserId, wallet: { gte: total } },
        data: { wallet: { decrement: total } },
      });
      if (debited.count !== 1) {
        const sender = await tx.user.findUnique({
          where: { id: fromUserId },
          select: { id: true },
        });
        if (!sender) throw new ApiError(404, 'From user not found');
        throw new ApiError(400, 'Insufficient funds');
      }
      const sender = await tx.user.findUniqueOrThrow({
        where: { id: fromUserId },
        select: { wallet: true },
      });
      return sender.wallet;
    };

    const credit = async (): Promise<number> => {
      const recipient = await tx.user.findUnique({
        where: { id: toUserId },
        select: { id: true },
      });
      if (!recipient) throw new ApiError(404, 'To user not found');
      const credited = await tx.user.update({
        where: { id: toUserId },
        data: { wallet: { increment: total } },
        select: { wallet: true },
      });
      return credited.wallet;
    };

    // Deterministic lock order: always touch the lower id first.
    let fromWallet: number;
    let toWallet: number;
    if (fromUserId < toUserId) {
      fromWallet = await debit();
      toWallet = await credit();
    } else {
      toWallet = await credit();
      fromWallet = await debit();
    }

    const created = await tx.transaction.create({
      data: {
        type: TransactionType.TRANSFER,
        // `createTransaction` negates TRANSFER totals; history renders the same way.
        total: -total,
        fromUserId,
        toUserId,
        transactionRows: {
          create: transactionRows.map((row) => ({
            name: row.name,
            price: row.price,
            qty: row.qty,
            total: row.price * row.qty,
            goodsId: row.goodsId || null,
          })),
        },
      },
      select: { id: true },
    });

    return { id: created.id, total, fromWallet, toWallet } satisfies GuardedTransferResult;
  });

  // Past this line the coins have moved. Nothing below may throw: the caller
  // treats a throw as "no money moved" and releases whatever it claimed.
  try {
    const socketService = (globalThis as unknown as { socketService?: SocketService }).socketService;
    if (socketService) {
      await socketService.emitWalletUpdate(fromUserId, settled.fromWallet);
      await socketService.emitWalletUpdate(toUserId, settled.toWallet);
    }
    await notificationService.sendTransactionNotification(settled.id, fromUserId, true);
    await notificationService.sendTransactionNotification(settled.id, toUserId, false);
  } catch (error) {
    console.error('[createGuardedTransfer] Post-commit delivery failed:', error);
  }

  return settled;
}

export class TransactionService {
  static async createTransaction(data: CreateTransactionInput) {
    const { type, transactionRows, fromUserId, toUserId } = data;

    if (!transactionRows || transactionRows.length === 0) {
      throw new ApiError(400, 'Transaction must have at least one row');
    }

    const calculatedTotal = transactionRows.reduce((sum, row) => {
      const rowTotal = row.price * row.qty;
      if (row.total !== undefined && row.total !== rowTotal) {
        throw new ApiError(400, `Row total mismatch: expected ${rowTotal}, got ${row.total}`);
      }
      return sum + rowTotal;
    }, 0);

    let finalFromUserId = fromUserId;
    let finalToUserId = toUserId;
    let bandejaBankId: string | null = null;

    if (type === TransactionType.NEW_COIN || type === TransactionType.REFUND) {
      const bandejaBank = await getOrCreateBandejaBank();
      bandejaBankId = bandejaBank.id;
      finalFromUserId = bandejaBank.id;
      finalToUserId = toUserId || null;
      if (!finalToUserId) {
        throw new ApiError(400, 'To user ID is required for new coin or refund');
      }
    } else if (type === TransactionType.PURCHASE) {
      const bandejaBank = await getOrCreateBandejaBank();
      bandejaBankId = bandejaBank.id;
      finalFromUserId = fromUserId || null;
      finalToUserId = bandejaBank.id;
    } else if (type === TransactionType.TRANSFER) {
      if (!fromUserId || !toUserId) {
        throw new ApiError(400, 'Transfer requires both fromUserId and toUserId');
      }
      if (fromUserId === toUserId) {
        throw new ApiError(400, 'Cannot transfer to yourself');
      }
      const bandejaBank = await getOrCreateBandejaBank();
      bandejaBankId = bandejaBank.id;
    }

    if (finalFromUserId) {
      const fromUser = await prisma.user.findUnique({
        where: { id: finalFromUserId },
        select: { wallet: true, phone: true },
      });

      if (!fromUser) {
        throw new ApiError(404, 'From user not found');
      }

      const isBandejaBank = fromUser.phone === BANDEJA_BANK_IDENTIFIER || finalFromUserId === bandejaBankId;
      
      if (!isBandejaBank && fromUser.wallet < calculatedTotal) {
        throw new ApiError(400, 'Insufficient funds');
      }
    }

    if (finalToUserId) {
      const toUser = await prisma.user.findUnique({
        where: { id: finalToUserId },
        select: { id: true },
      });

      if (!toUser) {
        throw new ApiError(404, 'To user not found');
      }
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.transaction.create({
        data: {
          type,
          total: type === TransactionType.PURCHASE || type === TransactionType.TRANSFER
            ? -calculatedTotal
            : calculatedTotal,
          fromUserId: finalFromUserId,
          toUserId: finalToUserId,
          transactionRows: {
            create: transactionRows.map((row) => ({
              name: row.name,
              price: row.price,
              qty: row.qty,
              total: row.price * row.qty,
              goodsId: row.goodsId || null,
            })),
          },
        },
        include: {
          transactionRows: {
            include: {
              goods: true,
            },
          },
          fromUser: {
            select: {
              ...USER_SELECT_WITH_SPORT_PROFILES,
              phone: true,
            },
          },
          toUser: {
            select: {
              ...USER_SELECT_WITH_SPORT_PROFILES,
              phone: true,
            },
          },
        },
      });

      let fromUserWallet: number | null = null;
      let toUserWallet: number | null = null;

      if (finalFromUserId) {
        const fromUser = await tx.user.findUnique({
          where: { id: finalFromUserId },
          select: { phone: true, wallet: true },
        });

        const isBandejaBank = fromUser?.phone === BANDEJA_BANK_IDENTIFIER || finalFromUserId === bandejaBankId;
        
        if (!isBandejaBank) {
          const updatedFromUser = await tx.user.update({
            where: { id: finalFromUserId },
            data: {
              wallet: {
                decrement: calculatedTotal,
              },
            },
            select: { wallet: true },
          });
          fromUserWallet = updatedFromUser.wallet;
        }
      }

      if (finalToUserId) {
        const updatedToUser = await tx.user.update({
          where: { id: finalToUserId },
          data: {
            wallet: {
              increment: calculatedTotal,
            },
          },
          select: { wallet: true, phone: true },
        });
        const isBandejaBank = updatedToUser.phone === BANDEJA_BANK_IDENTIFIER || finalToUserId === bandejaBankId;
        if (!isBandejaBank) {
          toUserWallet = updatedToUser.wallet;
        }
      }

      return { transaction: createdTransaction, fromUserWallet, toUserWallet, bandejaBankId };
    });

    const socketService = (global as any).socketService as SocketService | undefined;
    if (socketService) {
      if (transaction.fromUserWallet !== null && finalFromUserId) {
        await socketService.emitWalletUpdate(finalFromUserId, transaction.fromUserWallet, transaction.bandejaBankId);
      }
      if (transaction.toUserWallet !== null && finalToUserId) {
        await socketService.emitWalletUpdate(finalToUserId, transaction.toUserWallet, transaction.bandejaBankId);
      }
    }

    // Send notifications
    try {
      const isBandejaBankFrom = transaction.transaction.fromUser?.phone === BANDEJA_BANK_IDENTIFIER || finalFromUserId === bandejaBankId;
      const isBandejaBankTo = transaction.transaction.toUser?.phone === BANDEJA_BANK_IDENTIFIER || finalToUserId === bandejaBankId;

      if (type === TransactionType.TRANSFER) {
        // Notify sender
        if (finalFromUserId && !isBandejaBankFrom) {
          await notificationService.sendTransactionNotification(transaction.transaction.id, finalFromUserId, true);
        }
        // Notify receiver
        if (finalToUserId && !isBandejaBankTo) {
          await notificationService.sendTransactionNotification(transaction.transaction.id, finalToUserId, false);
        }
      } else if (type === TransactionType.NEW_COIN || type === TransactionType.REFUND) {
        // Notify receiver
        if (finalToUserId && !isBandejaBankTo) {
          await notificationService.sendTransactionNotification(transaction.transaction.id, finalToUserId, false);
        }
      } else if (type === TransactionType.PURCHASE) {
        // Notify sender
        if (finalFromUserId && !isBandejaBankFrom) {
          await notificationService.sendTransactionNotification(transaction.transaction.id, finalFromUserId, true);
        }
      }
    } catch (error) {
      console.error('[TransactionService] Failed to send transaction notifications:', error);
    }

    return projectTransactionEmbeddedUsers(transaction.transaction);
  }

  static async getUserTransactions(userId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          OR: [
            { fromUserId: userId },
            { toUserId: userId },
          ],
        },
        include: {
          transactionRows: {
            include: {
              goods: true,
            },
          },
          fromUser: {
            select: USER_SELECT_WITH_SPORT_PROFILES,
          },
          toUser: {
            select: USER_SELECT_WITH_SPORT_PROFILES,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.transaction.count({
        where: {
          OR: [
            { fromUserId: userId },
            { toUserId: userId },
          ],
        },
      }),
    ]);

    return {
      transactions: transactions.map(projectTransactionEmbeddedUsers),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async getTransactionById(transactionId: string, userId?: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        transactionRows: {
          include: {
            goods: true,
          },
        },
        fromUser: {
          select: USER_SELECT_WITH_SPORT_PROFILES,
        },
        toUser: {
          select: USER_SELECT_WITH_SPORT_PROFILES,
        },
      },
    });

    if (!transaction) {
      throw new ApiError(404, 'Transaction not found');
    }

    if (userId) {
      const isParticipant = transaction.fromUserId === userId || transaction.toUserId === userId;
      if (!isParticipant) {
        throw new ApiError(403, 'Access denied');
      }
    }

    return projectTransactionEmbeddedUsers(transaction);
  }

  static async getUserWallet(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SELECT_FIELDS,
        wallet: true,
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    return {
      userId: user.id,
      wallet: user.wallet,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  static async dropCoins(amount: number, description?: string, cityId?: string) {
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new ApiError(400, 'Amount must be a positive integer');
    }

    const whereClause: any = {
      isActive: true,
      OR: [
        { phone: null },
        { phone: { not: BANDEJA_BANK_IDENTIFIER } },
      ],
    };

    if (cityId) {
      whereClause.currentCityId = cityId;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: USER_SELECT_FIELDS,
    });

    const results = {
      totalUsers: users.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; userName: string; error: string }>,
    };

    for (const user of users) {
      try {
        await TransactionService.createTransaction({
          type: TransactionType.NEW_COIN,
          toUserId: user.id,
          transactionRows: [
            {
              name: description || 'Admin coin drop',
              price: amount,
              qty: 1,
            },
          ],
        });
        results.successful++;
      } catch (error) {
        results.failed++;
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({
          userId: user.id,
          userName,
          error: errorMessage,
        });
        console.error(`[dropCoins] Failed to drop coins to user ${user.id} (${userName}):`, errorMessage);
      }
    }

    return results;
  }

  static async createRegistrationBonus(userId: string) {
    await this.createTransaction({
      type: TransactionType.NEW_COIN,
      toUserId: userId,
      transactionRows: [{ name: 'Registration Bonus', price: 100, qty: 1 }],
    });
  }
}

