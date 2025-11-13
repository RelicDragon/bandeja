import api from './axios';
import { ApiResponse } from '@/types';

export type TransactionType = 'NEW_COIN' | 'TRANSFER' | 'PURCHASE' | 'REFUND';

export interface TransactionRow {
  id: string;
  transactionId: string;
  goodsId?: string | null;
  name: string;
  price: number;
  qty: number;
  total: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  total: number;
  fromUserId?: string | null;
  toUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  transactionRows: TransactionRow[];
  fromUser?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  toUser?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface Wallet {
  userId: string;
  wallet: number;
  firstName?: string | null;
  lastName?: string | null;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateTransactionRequest {
  type: TransactionType;
  transactionRows: Array<{
    name: string;
    price: number;
    qty: number;
    total?: number;
    goodsId?: string | null;
  }>;
  fromUserId?: string | null;
  toUserId?: string | null;
}

export const transactionsApi = {
  getWallet: async () => {
    const response = await api.get<ApiResponse<Wallet>>('/transactions/wallet');
    return response.data;
  },

  getTransactions: async (page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<TransactionsResponse>>('/transactions', {
      params: { page, limit },
    });
    return response.data;
  },

  getTransactionById: async (id: string) => {
    const response = await api.get<ApiResponse<Transaction>>(`/transactions/${id}`);
    return response.data;
  },

  createTransaction: async (data: CreateTransactionRequest) => {
    const response = await api.post<ApiResponse<Transaction>>('/transactions', data);
    return response.data;
  },

  transferCoins: async (toUserId: string, amount: number, message?: string) => {
    return transactionsApi.createTransaction({
      type: 'TRANSFER',
      transactionRows: [
        {
          name: message || 'Transfer',
          price: amount,
          qty: 1,
          total: amount,
        },
      ],
      toUserId,
    });
  },
};

