import api from './axios';

export interface LocationResponse {
  latitude: number;
  longitude: number;
}

export const appApi = {
  getLocation: async (): Promise<LocationResponse | null> => {
    try {
      const response = await api.get<LocationResponse>('/app/location');
      return response.data;
    } catch {
      return null;
    }
  },
};
