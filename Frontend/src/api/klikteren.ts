import api from './axios';
import { ApiResponse } from '@/types';

export type KlikterenAuthStatus = {
  connected: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type KlikterenSessionTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
  externalUserId: string;
};

export type KlikterenSnapshotCourt = {
  courtId: string | null;
  externalCourtId: string | null;
  externalCourtName: string | null;
  busySlots: Array<{ startTime: string; endTime: string }>;
};

export type KlikterenSnapshotPayload = {
  date: string;
  fetchedAt: string | null;
  courts: KlikterenSnapshotCourt[];
};

export type KlikterenMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  klikterenVenueId: string | null;
  connected: boolean;
  email: string | null;
  scoutOptIn: boolean;
  cityTimezone: string | null;
  courts: Array<{
    id: string;
    name: string;
    externalCourtId: string | null;
    integrationCourtName?: string | null;
  }>;
};

export type KlikterenMyClubsPayload = {
  cityKlikterenClubCount: number;
  connectedCount: number;
  clubs: KlikterenMyClubRow[];
};

export type KlikterenLinkedGame = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
  timeIsSet: boolean;
  status: string;
  linkBookingStart?: string | null;
  linkBookingEnd?: string | null;
};

export const klikterenApi = {
  getAuth: async (clubId: string) => {
    const response = await api.get<ApiResponse<KlikterenAuthStatus>>(`/clubs/${clubId}/klikteren/auth`);
    return response.data;
  },

  putAuth: async (
    clubId: string,
    body: {
      accessToken: string;
      refreshToken?: string | null;
      externalUserId: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    },
  ) => {
    const response = await api.put<ApiResponse<KlikterenAuthStatus>>(`/clubs/${clubId}/klikteren/auth`, body);
    return response.data;
  },

  getSessionToken: async (clubId: string) => {
    const response = await api.post<ApiResponse<KlikterenSessionTokenPayload>>(
      `/clubs/${clubId}/klikteren/session-token`,
    );
    return response.data;
  },

  deleteAuth: async (clubId: string) => {
    const response = await api.delete<ApiResponse<{ connected: boolean }>>(`/clubs/${clubId}/klikteren/auth`);
    return response.data;
  },

  getSnapshot: async (clubId: string, date: string) => {
    const response = await api.get<ApiResponse<KlikterenSnapshotPayload>>(`/clubs/${clubId}/klikteren/snapshot`, {
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
    },
  ) => {
    const response = await api.put<ApiResponse<KlikterenSnapshotPayload>>(`/clubs/${clubId}/klikteren/snapshot`, body);
    return response.data;
  },

  getMyClubs: async () => {
    const response = await api.get<ApiResponse<KlikterenMyClubsPayload>>('/klikteren/my-clubs');
    return response.data;
  },

  getLinkedGames: async (externalBookingId: string) => {
    const response = await api.get<ApiResponse<KlikterenLinkedGame[]>>(
      `/klikteren/linked-games/${encodeURIComponent(externalBookingId)}`,
    );
    return response.data;
  },
};
