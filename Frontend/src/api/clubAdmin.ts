import api from './axios';
import { ApiResponse, Club, Court } from '@/types';

export type CourtSlotHoldLabel = 'WALK_IN' | 'PHONE' | 'ACADEMY' | 'MAINTENANCE' | 'OTHER';

export interface ClubAdminClubListItem {
  id: string;
  name: string;
  avatar: string | null;
  address: string;
  openingTime: string | null;
  closingTime: string | null;
  city: { id: string; name: string; timezone: string };
  courtsCount: number;
  bookingsToday: number;
  integrationScriptName: string | null;
}

export type ScheduleSlot =
  | {
      type: 'game';
      gameId: string;
      courtId: string | null;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: string;
      entityType: string;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      type: 'game_court';
      gameId: string;
      courtId: string;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: string;
      entityType: string;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      type: 'external';
      courtId: string;
      courtName: string | null;
      startTime: string;
      endTime: string;
    }
  | {
      type: 'hold';
      holdId: string;
      courtId: string;
      label: CourtSlotHoldLabel;
      note: string | null;
      startTime: string;
      endTime: string;
    };

export interface ClubAdminScheduleResponse {
  slots: ScheduleSlot[];
  conflicts: Array<{ courtId: string; startTime: string; endTime: string; kinds: string[] }>;
  isLoadingExternalSlots: boolean;
  externalSlotsFailed?: boolean;
}

export interface CourtSlotHold {
  id: string;
  clubId: string;
  courtId: string;
  startTime: string;
  endTime: string;
  label: CourtSlotHoldLabel;
  note: string | null;
}

export type ClubAdminReservationItem =
  | {
      kind: 'game';
      id: string;
      gameId: string;
      courtId: string | null;
      courtName: string | null;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: string;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      kind: 'hold';
      id: string;
      holdId: string;
      courtId: string;
      courtName: string | null;
      startTime: string;
      endTime: string;
      label: CourtSlotHoldLabel;
      note: string | null;
    };

export interface ClubAdminReservationsResponse {
  items: ClubAdminReservationItem[];
  hasMore: boolean;
}

export interface ClubAdminClubsListResponse {
  items: ClubAdminClubListItem[];
  hasMore: boolean;
  total: number;
}

export const clubAdminApi = {
  listClubs: async (params?: { limit?: number; offset?: number; q?: string }) => {
    const res = await api.get<ApiResponse<ClubAdminClubsListResponse | ClubAdminClubListItem[]>>(
      '/club-admin/clubs',
      { params }
    );
    const raw = res.data.data;
    if (Array.isArray(raw)) {
      return { items: raw, hasMore: false, total: raw.length };
    }
    return {
      items: Array.isArray(raw?.items) ? raw.items : [],
      hasMore: raw?.hasMore ?? false,
      total: raw?.total ?? 0,
    };
  },

  getClub: async (clubId: string) => {
    const res = await api.get<ApiResponse<Club & { integrationActive: boolean }>>(
      `/club-admin/clubs/${clubId}`
    );
    return res.data.data!;
  },

  patchClub: async (clubId: string, data: Partial<Club>) => {
    const res = await api.patch<ApiResponse<Club>>(`/club-admin/clubs/${clubId}`, data);
    return res.data.data!;
  },

  getSchedule: async (clubId: string, date: string, courtId?: string) => {
    const res = await api.get<ApiResponse<ClubAdminScheduleResponse>>(
      `/club-admin/clubs/${clubId}/schedule`,
      { params: { date, courtId } }
    );
    return res.data.data!;
  },

  listReservations: async (clubId: string, params?: { limit?: number; offset?: number }) => {
    const res = await api.get<ApiResponse<ClubAdminReservationsResponse>>(
      `/club-admin/clubs/${clubId}/reservations`,
      { params }
    );
    return res.data.data!;
  },

  listCourts: async (clubId: string) => {
    const res = await api.get<ApiResponse<Court[]>>(`/club-admin/clubs/${clubId}/courts`);
    return res.data.data ?? [];
  },

  createCourt: async (clubId: string, data: Partial<Court>) => {
    const res = await api.post<ApiResponse<Court>>(`/club-admin/clubs/${clubId}/courts`, data);
    return res.data.data!;
  },

  patchCourt: async (courtId: string, data: Partial<Court>) => {
    const res = await api.patch<ApiResponse<Court>>(`/club-admin/courts/${courtId}`, data);
    return res.data.data!;
  },

  deactivateCourt: async (courtId: string) => {
    const res = await api.patch<ApiResponse<Court>>(`/club-admin/courts/${courtId}/deactivate`);
    return res.data.data!;
  },

  createHold: async (
    clubId: string,
    data: {
      courtId: string;
      startTime: string;
      endTime: string;
      label: CourtSlotHoldLabel;
      note?: string;
    }
  ) => {
    const res = await api.post<ApiResponse<CourtSlotHold>>(
      `/club-admin/clubs/${clubId}/holds`,
      data
    );
    return res.data.data!;
  },

  patchHold: async (holdId: string, data: Partial<CourtSlotHold>) => {
    const res = await api.patch<ApiResponse<CourtSlotHold>>(`/club-admin/holds/${holdId}`, data);
    return res.data.data!;
  },

  deleteHold: async (holdId: string) => {
    await api.delete(`/club-admin/holds/${holdId}`);
  },

  cancelGame: async (
    clubId: string,
    gameId: string,
    body: { reason: string; note?: string; message?: string }
  ) => {
    const res = await api.post(`/club-admin/clubs/${clubId}/games/${gameId}/cancel`, body);
    return res.data;
  },

  clearCourt: async (
    clubId: string,
    gameId: string,
    body: { reason: string; note?: string; message?: string }
  ) => {
    const res = await api.post(`/club-admin/clubs/${clubId}/games/${gameId}/clear-court`, body);
    return res.data;
  },
};
