import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { TransactionType } from '@prisma/client';
import SocketService from './socket.service';
import notificationService from './notification.service';
import { USER_SELECT_FIELDS } from '../utils/constants';

const BANDEJA_BANK_IDENTIFIER = 'BANDEJA_BANK';

async function getOrCreateBandejaBank() {
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
        authProvider: 'PHONE',
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
              ...USER_SELECT_FIELDS,
              phone: true,
            },
          },
          toUser: {
            select: {
              ...USER_SELECT_FIELDS,
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

    return transaction.transaction;
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
            select: USER_SELECT_FIELDS,
          },
          toUser: {
            select: USER_SELECT_FIELDS,
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
      transactions,
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
          select: USER_SELECT_FIELDS,
        },
        toUser: {
          select: USER_SELECT_FIELDS,
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

    return transaction;
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
      wallet: 0,
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
}

