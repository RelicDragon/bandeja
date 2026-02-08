import api from './axios';
import { ApiResponse, MarketItem, MarketItemCategory } from '@/types';

export interface MarketItemFilters {
  cityId?: string;
  categoryId?: string;
  tradeType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface MarketItemCreateData {
  categoryId: string;
  cityId?: string;
  title: string;
  description?: string;
  mediaUrls?: string[];
  tradeTypes: string[];
  priceCents?: number;
  currency?: string;
  auctionEndsAt?: string;
}

export const marketplaceApi = {
  getCategories: async () => {
    const response = await api.get<ApiResponse<MarketItemCategory[]>>('/market-items/categories');
    return response.data;
  },

  getMarketItems: async (filters?: MarketItemFilters) => {
    const response = await api.get<ApiResponse<MarketItem[]> & { pagination?: { page: number; limit: number; total: number; hasMore: boolean } }>(
      '/market-items',
      { params: filters }
    );
    return response.data;
  },

  getMarketItemById: async (id: string) => {
    const response = await api.get<ApiResponse<MarketItem>>(`/market-items/${id}`);
    return response.data;
  },

  createMarketItem: async (data: MarketItemCreateData) => {
    const response = await api.post<ApiResponse<MarketItem>>('/market-items', data);
    return response.data;
  },

  updateMarketItem: async (id: string, data: Partial<MarketItemCreateData>) => {
    const response = await api.put<ApiResponse<MarketItem>>(`/market-items/${id}`, data);
    return response.data;
  },

  withdrawMarketItem: async (id: string) => {
    const response = await api.post<ApiResponse<MarketItem>>(`/market-items/${id}/withdraw`);
    return response.data;
  },

  joinMarketItemChat: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/market-items/${id}/join-chat`);
    return response.data;
  },

  leaveMarketItemChat: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/market-items/${id}/leave-chat`);
    return response.data;
  },
};
