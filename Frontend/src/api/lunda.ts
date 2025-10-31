import api from './axios';

interface SyncLundaProfileData {
  phone: string;
  gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  level?: number;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
  metadata: any;
}

interface LundaAuthData {
  phone: string;
  code: string;
  temporalToken: string;
}

interface LundaProfileData {
  phone?: string;
  gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  level?: number;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
}

export const lundaApi = {
  syncProfile: async (data: SyncLundaProfileData) => {
    const response = await api.post('/lunda/sync-profile', data);
    return response.data;
  },
  auth: async (data: LundaAuthData) => {
    const response = await api.post('/lunda/auth', data);
    return response.data;
  },
  getProfile: async (data: LundaProfileData) => {
    const response = await api.post('/lunda/profile', data);
    return response.data;
  },
  getStatus: async () => {
    const response = await api.get('/lunda/status');
    return response.data;
  },
};
