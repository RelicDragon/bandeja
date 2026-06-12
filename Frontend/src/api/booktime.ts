import api from './axios';
import { ApiResponse, User } from '@/types';

export type BooktimeAuthStatus = {
  connected: boolean;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type BooktimeSessionTokenPayload = {
  accessToken: string;
  refreshToken: string;
  externalUserId: string;
  expiresAt: string | null;
};

export type BooktimeSnapshotCourt = {
  courtId: string | null;
  externalCourtId: string | null;
  externalCourtName: string | null;
  busySlots: Array<{ startTime: string; endTime: string }>;
};

export type BooktimeSnapshotPayload = {
  date: string;
  fetchedAt: string | null;
  courts: BooktimeSnapshotCourt[];
};

export type BooktimeScoutTokenPayload =
  | { available: true; authId: string; accessToken: string }
  | { available: false };

export type BooktimeMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  companyId: string | null;
  connected: boolean;
  phoneNumber: string | null;
  scoutOptIn: boolean;
  courts: Array<{
    id: string;
    name: string;
    externalCourtId: string | null;
    integrationCourtName?: string | null;
  }>;
};

export type BooktimeMyClubsPayload = {
  cityBooktimeClubCount: number;
  connectedCount: number;
  clubs: BooktimeMyClubRow[];
};

export type BooktimeLinkedGame = {
  id: string;
  name: string | null;
  startTime: string;
  status: string;
};

export const booktimeApi = {
  getAuth: async (clubId: string) => {
    const response = await api.get<ApiResponse<BooktimeAuthStatus>>(`/clubs/${clubId}/booktime/auth`);
    return response.data;
  },

  putAuth: async (
    clubId: string,
    body: {
      accessToken: string;
      refreshToken: string;
      externalUserId: string;
      phoneNumber?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      expiresAt?: string | null;
    }
  ) => {
    const response = await api.put<ApiResponse<BooktimeAuthStatus>>(`/clubs/${clubId}/booktime/auth`, body);
    return response.data;
  },

  getSessionToken: async (clubId: string) => {
    const response = await api.post<ApiResponse<BooktimeSessionTokenPayload>>(
      `/clubs/${clubId}/booktime/session-token`
    );
    return response.data;
  },

  deleteAuth: async (clubId: string) => {
    const response = await api.delete<ApiResponse<{ connected: boolean }>>(`/clubs/${clubId}/booktime/auth`);
    return response.data;
  },

  getSnapshot: async (clubId: string, date: string) => {
    const response = await api.get<ApiResponse<BooktimeSnapshotPayload>>(`/clubs/${clubId}/booktime/snapshot`, {
      params: { date },
    });
    return response.data;
  },

  putSnapshot: async (
    clubId: string,
    body: {
      date: string;
      fetchedAt: string;
      force?: boolean;
      courts: Array<{
        courtId: string | null;
        externalCourtId: string;
        externalCourtName?: string | null;
        busySlots: Array<{ startTime: string; endTime: string }>;
      }>;
    }
  ) => {
    const response = await api.put<ApiResponse<BooktimeSnapshotPayload>>(`/clubs/${clubId}/booktime/snapshot`, body);
    return response.data;
  },

  getScoutToken: async (clubId: string, excludeAuthIds: string[] = []) => {
    const response = await api.get<ApiResponse<BooktimeScoutTokenPayload>>(`/clubs/${clubId}/booktime/scout-token`, {
      params: excludeAuthIds.length ? { excludeAuthIds: excludeAuthIds.join(',') } : undefined,
    });
    return response.data;
  },

  invalidateScoutToken: async (clubId: string, authId: string) => {
    const response = await api.post<ApiResponse<{ invalidated: boolean }>>(
      `/clubs/${clubId}/booktime/scout-token/invalidate`,
      { authId }
    );
    return response.data;
  },

  getMyClubs: async () => {
    const response = await api.get<ApiResponse<BooktimeMyClubsPayload>>('/booktime/my-clubs');
    return response.data;
  },

  dismissConnectHint: async () => {
    const response = await api.post<ApiResponse<User>>('/booktime/connect-hint/dismiss');
    return response.data;
  },

  getLinkedGame: async (externalBookingId: string) => {
    const response = await api.get<ApiResponse<BooktimeLinkedGame | null>>(
      `/booktime/linked-game/${encodeURIComponent(externalBookingId)}`
    );
    return response.data;
  },
};
