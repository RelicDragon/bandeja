import api from './axios';
import type { ApiResponse, WeatherWindow } from '@/types';

export type WeatherWindowScope = 'game' | 'day';

export const weatherApi = {
  getPreview: async (params: {
    cityId: string;
    startTime: string;
    endTime: string;
    scope?: WeatherWindowScope;
  }): Promise<WeatherWindow> => {
    const response = await api.get<ApiResponse<WeatherWindow>>('/weather/preview', { params });
    return response.data.data;
  },

  getGameWeather: async (gameId: string, scope: WeatherWindowScope = 'game'): Promise<WeatherWindow> => {
    const response = await api.get<ApiResponse<WeatherWindow>>(`/games/${gameId}/weather`, {
      params: scope === 'day' ? { scope } : undefined,
    });
    return response.data.data;
  },
};
