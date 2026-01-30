import api from './axios';
import { ApiResponse, Bet, BetCondition } from '@/types';

export const betsApi = {
  getGameBets: async (gameId: string) => {
    const response = await api.get<ApiResponse<Bet[]>>(`/bets/game/${gameId}`);
    return response.data;
  },

  create: async (data: {
    gameId: string;
    condition: BetCondition;
    type?: 'POOL' | 'SOCIAL';
    stakeType: 'COINS' | 'TEXT';
    stakeCoins?: number | null;
    stakeText?: string | null;
    rewardType?: 'COINS' | 'TEXT';
    rewardCoins?: number | null;
    rewardText?: string | null;
  }) => {
    const response = await api.post<ApiResponse<Bet>>('/bets', data);
    return response.data;
  },

  update: async (id: string, data: Partial<{ 
    condition: BetCondition; 
    stakeType: 'COINS' | 'TEXT';
    stakeCoins?: number | null;
    stakeText?: string | null;
    rewardType: 'COINS' | 'TEXT';
    rewardCoins?: number | null;
    rewardText?: string | null;
  }>) => {
    const response = await api.put<ApiResponse<Bet>>(`/bets/${id}`, data);
    return response.data;
  },

  accept: async (id: string, side?: 'WITH_CREATOR' | 'AGAINST_CREATOR') => {
    const response = await api.post<ApiResponse<Bet>>(`/bets/${id}/accept`, side != null ? { side } : undefined);
    return response.data;
  },

  cancel: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/bets/${id}`);
    return response.data;
  },
};
