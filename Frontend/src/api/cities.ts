import api from './axios';
import { ApiResponse, City } from '@/types';

export const citiesApi = {
  getAll: async () => {
    const response = await api.get<ApiResponse<City[]>>('/cities');
    return response.data;
  },
};

