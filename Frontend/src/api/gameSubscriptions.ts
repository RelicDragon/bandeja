import api from './axios';
import { ApiResponse } from '@/types';

export interface GameSubscription {
  id: string;
  userId: string;
  cityId: string;
  clubIds: string[];
  entityTypes: string[];
  dayOfWeek: number[];
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  minLevel?: number;
  maxLevel?: number;
  myGenderOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  city?: {
    id: string;
    name: string;
    country: string;
  };
}

export interface CreateSubscriptionDto {
  cityId: string;
  clubIds?: string[];
  entityTypes?: string[];
  dayOfWeek?: number[];
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  minLevel?: number;
  maxLevel?: number;
  myGenderOnly?: boolean;
}

export interface UpdateSubscriptionDto extends Partial<CreateSubscriptionDto> {
  isActive?: boolean;
}

export const gameSubscriptionsApi = {
  getSubscriptions: async () => {
    const response = await api.get<ApiResponse<GameSubscription[]>>('/game-subscriptions');
    return response.data;
  },

  createSubscription: async (data: CreateSubscriptionDto) => {
    const response = await api.post<ApiResponse<GameSubscription>>('/game-subscriptions', data);
    return response.data;
  },

  updateSubscription: async (id: string, data: UpdateSubscriptionDto) => {
    const response = await api.put<ApiResponse<GameSubscription>>(`/game-subscriptions/${id}`, data);
    return response.data;
  },

  deleteSubscription: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/game-subscriptions/${id}`);
    return response.data;
  },
};

