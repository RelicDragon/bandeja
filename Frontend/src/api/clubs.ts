import api from './axios';
import { ApiResponse, Club, EntityType } from '@/types';

export interface ClubMapItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  cityId: string;
  cityName: string;
  country: string;
  courtsCount: number;
}

export interface MapBbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

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
};
