import api from './axios';
import { ApiResponse } from '@/types';

export interface Faq {
  id: string;
  gameId: string;
  question: string;
  answer: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFaqData {
  gameId: string;
  question: string;
  answer: string;
  order?: number;
}

export interface UpdateFaqData {
  question?: string;
  answer?: string;
  order?: number;
}

export const faqApi = {
  getGameFaqs: async (gameId: string) => {
    const response = await api.get<ApiResponse<Faq[]>>(`/faqs/game/${gameId}`);
    return response.data;
  },

  createFaq: async (data: CreateFaqData) => {
    const response = await api.post<ApiResponse<Faq>>('/faqs', data);
    return response.data;
  },

  updateFaq: async (faqId: string, data: UpdateFaqData) => {
    const response = await api.put<ApiResponse<Faq>>(`/faqs/${faqId}`, data);
    return response.data;
  },

  deleteFaq: async (faqId: string) => {
    const response = await api.delete<ApiResponse<{ message: string }>>(`/faqs/${faqId}`);
    return response.data;
  },

  reorderFaqs: async (gameId: string, faqIds: string[]) => {
    const response = await api.put<ApiResponse<Faq[]>>(`/faqs/game/${gameId}/reorder`, { faqIds });
    return response.data;
  },
};

