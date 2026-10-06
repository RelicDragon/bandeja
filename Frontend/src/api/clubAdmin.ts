/**
 * Club admin HTTP client.
 *
 * Two generations live side by side: the console v2 endpoints from
 * `@shared/clubAdmin/contract` (context, dashboard, bookings, club-scoped holds) and the legacy
 * endpoints every store build still calls (club, courts, schedule, reservations, `/holds/:id`).
 * The v2 helpers fall back to the legacy path when the server answers a bare 404 (endpoint not
 * deployed yet), so the console runs against old and new backends alike.
 */
import api from './axios';
import { ApiResponse, Club, Court } from '@/types';
import type {
  BookingItem,
  BookingsQuery,
  CancelGameBody,
  ClubAdminContext,
  ClubDashboard,
  ClubScheduleResponseV2,
  CreateHoldBody,
  CreateHoldResponse,
  HoldDeleteScope,
  HoldLabel,
  Paged,
  UpdateHoldBody,
} from '@shared/clubAdmin/contract';
import { isEndpointMissing } from './clubAdminErrors';

export type CourtSlotHoldLabel = HoldLabel;

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
  integrationType: string | null;
}

export interface ClubAdminClubsListResponse {
  items: ClubAdminClubListItem[];
  hasMore: boolean;
  total: number;
}

/** Legacy `GET /club-admin/clubs/:clubId` — the full club row the settings and courts pages edit. */
export type ClubAdminLegacyClub = Club & {
  integrationActive?: boolean;
  defaultSlotMinutes?: number | null;
  cancellationNoticeHours?: number | null;
  policyText?: string | null;
  currency?: string | null;
};

/** Legacy `GET /reservations` row (upcoming only, offset paging). */
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
      label: HoldLabel;
      note: string | null;
    };

export interface ClubAdminReservationsResponse {
  items: ClubAdminReservationItem[];
  hasMore: boolean;
}

type RequestOpts = { signal?: AbortSignal };

const clubPath = (clubId: string) => `/club-admin/clubs/${encodeURIComponent(clubId)}`;

function serializeBookingsQuery(q: BookingsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { scope: q.scope };
  if (q.from) out.from = q.from;
  if (q.to) out.to = q.to;
  if (q.courtId) out.courtId = q.courtId;
  if (q.kinds && q.kinds.length > 0) out.kinds = q.kinds.join(',');
  if (q.payment) out.payment = q.payment;
  if (q.q && q.q.trim()) out.q = q.q.trim();
  if (q.cursor) out.cursor = q.cursor;
  if (q.limit) out.limit = q.limit;
  return out;
}

/** Legacy create answered the hold row; v2 answers `CreateHoldResponse`. */
function normalizeCreateHold(raw: unknown): CreateHoldResponse {
  const r = (raw ?? {}) as Partial<CreateHoldResponse> & { id?: string };
  if (Array.isArray(r.holdIds)) {
    return { holdIds: r.holdIds, seriesId: r.seriesId ?? null, skipped: Array.isArray(r.skipped) ? r.skipped : [] };
  }
  return { holdIds: r.id ? [r.id] : [], seriesId: null, skipped: [] };
}

export const clubAdminApi = {
  // -------------------------------------------------------------------------
  // Clubs (legacy, still the source for the picker, settings and courts pages)
  // -------------------------------------------------------------------------
  listClubs: async (params?: { limit?: number; offset?: number; q?: string }, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubAdminClubsListResponse | ClubAdminClubListItem[]>>(
      '/club-admin/clubs',
      { params, signal: opts?.signal }
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

  getClub: async (clubId: string, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubAdminLegacyClub>>(clubPath(clubId), { signal: opts?.signal });
    return res.data.data!;
  },

  patchClub: async (clubId: string, data: Partial<Club>) => {
    const res = await api.patch<ApiResponse<Club>>(clubPath(clubId), data);
    return res.data.data!;
  },

  listCourts: async (clubId: string) => {
    const res = await api.get<ApiResponse<Court[]>>(`${clubPath(clubId)}/courts`);
    return res.data.data ?? [];
  },

  createCourt: async (clubId: string, data: Partial<Court>) => {
    const res = await api.post<ApiResponse<Court>>(`${clubPath(clubId)}/courts`, data);
    return res.data.data!;
  },

  patchCourt: async (courtId: string, data: Partial<Court>) => {
    const res = await api.patch<ApiResponse<Court>>(`/club-admin/courts/${encodeURIComponent(courtId)}`, data);
    return res.data.data!;
  },

  deactivateCourt: async (courtId: string) => {
    const res = await api.patch<ApiResponse<Court>>(`/club-admin/courts/${encodeURIComponent(courtId)}/deactivate`);
    return res.data.data!;
  },

  // -------------------------------------------------------------------------
  // Console v2 reads
  // -------------------------------------------------------------------------
  getContext: async (clubId: string, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubAdminContext>>(`${clubPath(clubId)}/context`, { signal: opts?.signal });
    return res.data.data;
  },

  getDashboard: async (clubId: string, date: string | undefined, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubDashboard>>(`${clubPath(clubId)}/dashboard`, {
      params: date ? { date } : undefined,
      signal: opts?.signal,
    });
    return res.data.data;
  },

  /** Legacy endpoint with additive v2 fields (`hours`, `courts`, `slotMinutes`, …). */
  getSchedule: async (clubId: string, date: string, opts?: RequestOpts & { courtId?: string }) => {
    const res = await api.get<ApiResponse<ClubScheduleResponseV2>>(`${clubPath(clubId)}/schedule`, {
      params: { date, courtId: opts?.courtId },
      signal: opts?.signal,
    });
    return res.data.data;
  },

  listBookings: async (clubId: string, query: BookingsQuery, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<Paged<BookingItem>>>(`${clubPath(clubId)}/bookings`, {
      params: serializeBookingsQuery(query),
      signal: opts?.signal,
    });
    return res.data.data;
  },

  /** Legacy upcoming list — used only when `/bookings` is not deployed. */
  listReservations: async (clubId: string, params: { limit?: number; offset?: number }, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubAdminReservationsResponse>>(`${clubPath(clubId)}/reservations`, {
      params,
      signal: opts?.signal,
    });
    return res.data.data;
  },

  // -------------------------------------------------------------------------
  // Holds — club-scoped v2 paths with legacy fallback
  // -------------------------------------------------------------------------
  createHold: async (clubId: string, body: CreateHoldBody): Promise<CreateHoldResponse> => {
    const res = await api.post<ApiResponse<unknown>>(`${clubPath(clubId)}/holds`, body);
    return normalizeCreateHold(res.data.data);
  },

  updateHold: async (clubId: string, holdId: string, body: UpdateHoldBody): Promise<void> => {
    try {
      await api.patch(`${clubPath(clubId)}/holds/${encodeURIComponent(holdId)}`, body);
    } catch (e) {
      if (!isEndpointMissing(e)) throw e;
      await api.patch(`/club-admin/holds/${encodeURIComponent(holdId)}`, body);
    }
  },

  deleteHold: async (clubId: string, holdId: string, scope: HoldDeleteScope = 'one'): Promise<void> => {
    try {
      await api.delete(`${clubPath(clubId)}/holds/${encodeURIComponent(holdId)}`, { params: { scope } });
    } catch (e) {
      if (!isEndpointMissing(e)) throw e;
      await api.delete(`/club-admin/holds/${encodeURIComponent(holdId)}`);
    }
  },

  // -------------------------------------------------------------------------
  // Games (legacy paths, v2 error codes)
  // -------------------------------------------------------------------------
  cancelGame: async (clubId: string, gameId: string, body: CancelGameBody) => {
    const res = await api.post(`${clubPath(clubId)}/games/${encodeURIComponent(gameId)}/cancel`, body);
    return res.data;
  },

  clearCourt: async (clubId: string, gameId: string, body: CancelGameBody) => {
    const res = await api.post(`${clubPath(clubId)}/games/${encodeURIComponent(gameId)}/clear-court`, body);
    return res.data;
  },
};
