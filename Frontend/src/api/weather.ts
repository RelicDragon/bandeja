import api from './axios';
import type { ApiResponse, WeatherDay, WeatherWindow } from '@/types';

export type WeatherWindowScope = 'game' | 'day' | 'forecast';

export const weatherApi = {
  getDay: async (params: {
    cityId: string;
    date: string;
  }): Promise<WeatherDay> => {
    const response = await api.get<ApiResponse<WeatherDay>>('/weather/day', { params });
    return response.data.data;
  },

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
      params: scope === 'game' ? undefined : { scope },
    });
    return response.data.data;
  },
};
