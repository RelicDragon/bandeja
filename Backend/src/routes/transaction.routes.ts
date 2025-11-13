import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import * as transactionController from '../controllers/transaction.controller';

const router = Router();

router.post(
  '/',
  authenticate,
  validate([
    body('type').isIn(['NEW_COIN', 'TRANSFER', 'PURCHASE', 'REFUND']).withMessage('Valid transaction type is required'),
    body('transactionRows').isArray({ min: 1 }).withMessage('Transaction must have at least one row'),
    body('transactionRows.*.name').notEmpty().withMessage('Row name is required'),
    body('transactionRows.*.price').isInt({ min: 0 }).withMessage('Row price must be a non-negative integer'),
    body('transactionRows.*.qty').isInt({ min: 1 }).withMessage('Row quantity must be a positive integer'),
    body('transactionRows.*.goodsId').optional().isString().withMessage('Goods ID must be a string'),
    body('fromUserId').optional().isString().withMessage('From user ID must be a string'),
    body('toUserId').optional().isString().withMessage('To user ID must be a string'),
  ]),
  transactionController.createTransaction
);

router.get('/', authenticate, transactionController.getUserTransactions);

router.get('/wallet', authenticate, transactionController.getUserWallet);

router.get('/:id', authenticate, transactionController.getTransactionById);

export default router;

