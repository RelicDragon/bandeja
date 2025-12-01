import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { TransactionService } from '../services/transaction.service';

export const createTransaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, transactionRows, fromUserId, toUserId } = req.body;

  const transaction = await TransactionService.createTransaction({
    type,
    transactionRows,
    fromUserId: fromUserId || req.userId,
    toUserId,
  });

  res.status(201).json({
    success: true,
    data: transaction,
  });
});

export const getUserTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '50' } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);

  const result = await TransactionService.getUserTransactions(req.userId!, pageNum, limitNum);

  res.json({
    success: true,
    data: result,
  });
});

export const getTransactionById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const transaction = await TransactionService.getTransactionById(id, req.userId!);

  res.json({
    success: true,
    data: transaction,
  });
});

export const getUserWallet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const wallet = await TransactionService.getUserWallet(req.userId!);

  res.json({
    success: true,
    data: wallet,
  });
});

