import api from './axios';
import { ApiResponse } from '@/types';

export type PadelooAuthStatus = {
  connected: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  externalUserId: string | null;
  scoutOptIn: boolean;
};

export type PadelooSessionTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
  externalUserId: string;
};

export type PadelooSnapshotCourt = {
  courtId: string | null;
  externalCourtId: string | null;
  externalCourtName: string | null;
  busySlots: Array<{ startTime: string; endTime: string }>;
};

export type PadelooSnapshotPayload = {
  date: string;
  fetchedAt: string | null;
  courts: PadelooSnapshotCourt[];
};

export type PadelooMyClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  padelooClubId: number | null;
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

export type PadelooMyClubsPayload = {
  cityPadelooClubCount: number;
  connectedCount: number;
  clubs: PadelooMyClubRow[];
};

export type PadelooLinkedGame = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
  timeIsSet: boolean;
  status: string;
  linkBookingStart?: string | null;
  linkBookingEnd?: string | null;
};

export const padelooApi = {
  getAuth: async (clubId: string) => {
    const response = await api.get<ApiResponse<PadelooAuthStatus>>(`/clubs/${clubId}/padeloo/auth`);
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
    const response = await api.put<ApiResponse<PadelooAuthStatus>>(`/clubs/${clubId}/padeloo/auth`, body);
    return response.data;
  },

  getSessionToken: async (clubId: string) => {
    const response = await api.post<ApiResponse<PadelooSessionTokenPayload>>(
      `/clubs/${clubId}/padeloo/session-token`,
    );
    return response.data;
  },

  deleteAuth: async (clubId: string) => {
    const response = await api.delete<ApiResponse<{ connected: boolean }>>(`/clubs/${clubId}/padeloo/auth`);
    return response.data;
  },

  getSnapshot: async (clubId: string, date: string) => {
    const response = await api.get<ApiResponse<PadelooSnapshotPayload>>(`/clubs/${clubId}/padeloo/snapshot`, {
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
    const response = await api.put<ApiResponse<PadelooSnapshotPayload>>(`/clubs/${clubId}/padeloo/snapshot`, body);
    return response.data;
  },

  getMyClubs: async () => {
    const response = await api.get<ApiResponse<PadelooMyClubsPayload>>('/padeloo/my-clubs');
    return response.data;
  },

  getLinkedGames: async (externalBookingId: string) => {
    const response = await api.get<ApiResponse<PadelooLinkedGame[]>>(
      `/padeloo/linked-games/${encodeURIComponent(externalBookingId)}`,
    );
    return response.data;
  },
};
