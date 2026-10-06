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
  sourceRevision?: number;
  localizedText?: { locale: string; question: string; answer: string; state: 'original' | 'translated' };
}

export interface FaqTranslationStatus {
  generationEnabled: boolean;
  selectedLocales: string[];
  sourceLocaleOverride: string | null;
  snapshot: string;
  faqCount: number;
  locales: Array<{ locale: string; ready: number; pending: number; failed: number; stale: number; missing: number }>;
}

export interface FaqTranslationRequest {
  targetLocales: string[];
  sourceLocaleOverride: string | null;
  expectedSnapshot: string;
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

const inFlightGameFaqs = new Map<string, Promise<ApiResponse<Faq[]>>>();

export const faqApi = {
  /** Identical concurrent reads share one request (the season shell and FAQ editor ask together). */
  getGameFaqs: (gameId: string, locale?: string): Promise<ApiResponse<Faq[]>> => {
    const key = `${gameId}|${locale ?? ''}`;
    const pending = inFlightGameFaqs.get(key);
    if (pending) return pending;
    const request = api
      .get<ApiResponse<Faq[]>>(`/faqs/game/${gameId}`, { params: locale ? { locale } : undefined })
      .then((response) => response.data)
      .finally(() => inFlightGameFaqs.delete(key));
    inFlightGameFaqs.set(key, request);
    return request;
  },

  getTranslations: async (gameId: string) => {
    const response = await api.get<ApiResponse<FaqTranslationStatus>>(`/faqs/game/${gameId}/translations`);
    return response.data;
  },

  submitTranslations: async (gameId: string, data: FaqTranslationRequest) => {
    const response = await api.post<ApiResponse<FaqTranslationStatus>>(`/faqs/game/${gameId}/translations`, data);
    return response.data;
  },

  retryTranslations: async (gameId: string, data: FaqTranslationRequest) => {
    const response = await api.post<ApiResponse<FaqTranslationStatus>>(`/faqs/game/${gameId}/translations/retry`, data);
    return response.data;
  },

  requestReaderTranslation: async (gameId: string, locale: string, retry = false) => {
    const response = await api.post<ApiResponse<FaqTranslationStatus>>(`/faqs/game/${gameId}/translations/request`, { locale, retry });
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
