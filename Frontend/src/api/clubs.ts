import api from './axios';
import { ApiResponse, Club, ClubReview, ClubReviewSummary, EntityType, Game } from '@/types';

export interface ClubMapItem {
  id: string;
  name: string;
  avatar?: string | null;
  latitude: number;
  longitude: number;
  cityId: string;
  cityName: string;
  country: string;
  courtsCount: number;
  website?: string | null;
  phone?: string | null;
}

export interface MapBbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ClubReviewsListPayload {
  summary: ClubReviewSummary;
  reviews: ClubReview[];
  total: number;
  page: number;
  limit: number;
}

export type ClubEligibleReviewGame = Pick<Game, 'id' | 'name' | 'startTime' | 'entityType'>;

const MAP_CLUBS_CACHE_MS = 5 * 60 * 1000;
let mapClubsCache: { data: ClubMapItem[]; ts: number } | null = null;

export const clubsApi = {
  getForMap: async (bbox?: MapBbox | null) => {
    if (!bbox && mapClubsCache && Date.now() - mapClubsCache.ts < MAP_CLUBS_CACHE_MS) {
      return mapClubsCache.data;
    }
    const params =
      bbox != null
        ? { minLat: bbox.minLat, maxLat: bbox.maxLat, minLng: bbox.minLng, maxLng: bbox.maxLng }
        : undefined;
    const response = await api.get<ApiResponse<ClubMapItem[]>>('/clubs/map', { params });
    const data = response.data?.data ?? [];
    if (!bbox) {
      mapClubsCache = { data, ts: Date.now() };
    }
    return data;
  },

  getByCityId: async (cityId: string, entityType?: EntityType) => {
    const params = entityType ? { entityType } : {};
    const response = await api.get<ApiResponse<Club[]>>(`/clubs/city/${cityId}`, { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Club>>(`/clubs/${id}`);
    return response.data;
  },

  getReviews: async (
    clubId: string,
    params?: { page?: number; limit?: number; withTextOnly?: boolean }
  ): Promise<ApiResponse<ClubReviewsListPayload>> => {
    const response = await api.get<ApiResponse<ClubReviewsListPayload>>(`/clubs/${clubId}/reviews`, { params });
    return response.data;
  },

  getEligibleReviewGames: async (clubId: string): Promise<ApiResponse<ClubEligibleReviewGame[]>> => {
    const response = await api.get<ApiResponse<ClubEligibleReviewGame[]>>(`/clubs/${clubId}/review-eligible-games`);
    return response.data;
  },

  getMyClubReview: async (clubId: string, gameId: string): Promise<ApiResponse<ClubReview | null>> => {
    const response = await api.get<ApiResponse<ClubReview | null>>(`/clubs/${clubId}/my-review`, {
      params: { gameId },
    });
    return response.data;
  },

  submitClubReview: async (
    clubId: string,
    body: { gameId: string; stars: number; text?: string; photos?: { originalUrl: string; thumbnailUrl: string }[] }
  ): Promise<ApiResponse<{ review: ClubReview; summary: ClubReviewSummary }>> => {
    const response = await api.post<ApiResponse<{ review: ClubReview; summary: ClubReviewSummary }>>(
      `/clubs/${clubId}/reviews`,
      body
    );
    return response.data;
  },
};
