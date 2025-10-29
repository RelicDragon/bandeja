import api from './axios';

interface SyncLundaProfileData {
  phone: string;
  gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  level?: number;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
  metadata: any;
}

export const lundaApi = {
  syncProfile: async (data: SyncLundaProfileData) => {
    const response = await api.post('/lunda/sync-profile', data);
    return response.data;
  },
};
