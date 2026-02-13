import api from './axios';
import { ApiResponse, MarketItem, MarketItemBid, MarketItemCategory, MarketItemBidsResponse } from '@/types';

export interface MarketItemFilters {
  cityId?: string;
  categoryId?: string;
  tradeType?: string;
  status?: string;
  sellerId?: string;
  page?: number;
  limit?: number;
}

export interface MarketItemCreateData {
  categoryId: string;
  cityId?: string;
  additionalCityIds?: string[];
  title: string;
  description?: string;
  mediaUrls?: string[];
  tradeTypes: string[];
  negotiationAcceptable?: boolean;
  priceCents?: number;
  currency?: string;
  auctionEndsAt?: string;
  auctionType?: 'RISING' | 'HOLLAND';
  startingPriceCents?: number;
  reservePriceCents?: number;
  buyItNowPriceCents?: number;
  hollandDecrementCents?: number;
  hollandIntervalMinutes?: number;
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

  withdrawMarketItem: async (id: string, status?: 'WITHDRAWN' | 'SOLD' | 'RESERVED') => {
    const response = await api.post<ApiResponse<MarketItem>>(`/market-items/${id}/withdraw`, { status });
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

  reserveMarketItem: async (id: string, reserve: boolean) => {
    const response = await api.post<ApiResponse<MarketItem>>(`/market-items/${id}/reserve`, { reserve });
    return response.data;
  },

  expressInterest: async (id: string, tradeType: 'BUY_IT_NOW' | 'SUGGESTED_PRICE' | 'AUCTION' | 'FREE') => {
    const response = await api.post<{ success: boolean; message: string; chatId: string }>(`/market-items/${id}/express-interest`, { tradeType });
    return response.data;
  },

  getBids: async (id: string) => {
    const response = await api.get<ApiResponse<MarketItemBidsResponse>>(`/market-items/${id}/bids`);
    return response.data;
  },

  placeBid: async (id: string, amountCents: number) => {
    const response = await api.post<ApiResponse<{ bid: MarketItemBid; previousHighBidderId: string | null; isHollandWin: boolean }>>(
      `/market-items/${id}/bids`,
      { amountCents }
    );
    return response.data;
  },

  acceptBuyItNow: async (id: string) => {
    const response = await api.post<ApiResponse<{ success: boolean; amountCents: number }>>(`/market-items/${id}/accept-buy-it-now`);
    return response.data;
  },

  // Get buyer's private chat with seller (returns null if doesn't exist)
  getBuyerChat: async (marketItemId: string) => {
    try {
      const response = await api.get<ApiResponse<any | null>>(`/market-items/${marketItemId}/buyer-chat`);
      return response.data.data;
    } catch (err) {
      return null;
    }
  },

  // Create or get existing buyer chat (for "Ask seller" button)
  getOrCreateBuyerChat: async (marketItemId: string) => {
    const response = await api.post<ApiResponse<any>>(`/market-items/${marketItemId}/buyer-chat`);
    return response.data.data;
  },

  // Get all buyer conversations for sellers
  getSellerChats: async (marketItemId: string) => {
    const response = await api.get<ApiResponse<any[]>>(`/market-items/${marketItemId}/seller-chats`);
    return response.data.data;
  },
};
