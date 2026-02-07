import api from './axios';
import { ApiResponse, Invite } from '@/types';

export const invitesApi = {
  getMyInvites: async (status?: string) => {
    const response = await api.get<ApiResponse<Invite[]>>('/invites/my-invites', {
      params: { status },
    });
    return response.data;
  },

  getGameInvites: async (gameId: string) => {
    const response = await api.get<ApiResponse<Invite[]>>(`/invites/game/${gameId}`);
    return response.data;
  },

  send: async (data: {
    receiverId: string;
    gameId?: string;
    message?: string;
    expiresAt?: string;
    asTrainer?: boolean;
  }) => {
    const response = await api.post<ApiResponse<Invite>>('/invites', data);
    return response.data;
  },

  sendMultiple: async (data: {
    receiverIds: string[];
    gameId?: string;
    message?: string;
    expiresAt?: string;
    asTrainer?: boolean;
  }) => {
    const promises = data.receiverIds.map(receiverId =>
      api.post<ApiResponse<Invite>>('/invites', {
        receiverId,
        gameId: data.gameId,
        message: data.message,
        expiresAt: data.expiresAt,
        asTrainer: data.asTrainer,
      })
    );
    const responses = await Promise.all(promises);
    return responses.map(r => r.data);
  },

  accept: async (id: string) => {
    const response = await api.post<ApiResponse<Invite>>(`/invites/${id}/accept`);
    return response.data;
  },

  decline: async (id: string) => {
    const response = await api.post<ApiResponse<Invite>>(`/invites/${id}/decline`);
    return response.data;
  },

  cancel: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/invites/${id}/cancel`);
    return response.data;
  },
};

