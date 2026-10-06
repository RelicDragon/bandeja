/**
 * Club admin HTTP client — the Club area (profile, hours, courts, pricing, team, activity,
 * reviews). Console v2 endpoints only (`@shared/clubAdmin/contract`); these screens do not exist
 * in store builds, so there is no legacy fallback.
 */
import api from './axios';
import { ApiResponse } from '@/types';
import type {
  AddTeamMemberBody,
  ClubActivityAction,
  ClubActivityItem,
  ClubAdminCourt,
  ClubAdminReviewsResponse,
  ClubAdminRole,
  ClubHours,
  ClubPricing,
  ClubProfile,
  ClubTeamMember,
  CourtImpact,
  Paged,
  PatchClubProfileBody,
  PriceQuote,
  PutClubHoursBody,
  PutClubPricingBody,
  UpsertCourtBody,
} from '@shared/clubAdmin/contract';

type RequestOpts = { signal?: AbortSignal };

const clubPath = (clubId: string) => `/club-admin/clubs/${encodeURIComponent(clubId)}`;

async function get<T>(path: string, opts?: RequestOpts & { params?: Record<string, string | number | undefined> }): Promise<T> {
  const res = await api.get<ApiResponse<T>>(path, { params: opts?.params, signal: opts?.signal });
  return res.data.data as T;
}

export const clubAdminClubApi = {
  getProfile: (clubId: string, opts?: RequestOpts) => get<ClubProfile>(`${clubPath(clubId)}/profile`, opts),
  patchProfile: async (clubId: string, body: PatchClubProfileBody) => {
    const res = await api.patch<ApiResponse<ClubProfile>>(`${clubPath(clubId)}/profile`, body);
    return res.data.data as ClubProfile;
  },

  getHours: (clubId: string, opts?: RequestOpts) => get<ClubHours>(`${clubPath(clubId)}/hours`, opts),
  putHours: async (clubId: string, body: PutClubHoursBody) => {
    const res = await api.put<ApiResponse<ClubHours>>(`${clubPath(clubId)}/hours`, body);
    return res.data.data as ClubHours;
  },

  listCourts: (clubId: string, opts?: RequestOpts) => get<ClubAdminCourt[]>(`${clubPath(clubId)}/courts`, opts),
  createCourt: async (clubId: string, body: UpsertCourtBody) => {
    const res = await api.post<ApiResponse<ClubAdminCourt>>(`${clubPath(clubId)}/courts`, body);
    return res.data.data as ClubAdminCourt;
  },
  patchCourt: async (clubId: string, courtId: string, body: Partial<UpsertCourtBody>) => {
    const res = await api.patch<ApiResponse<ClubAdminCourt>>(`${clubPath(clubId)}/courts/${encodeURIComponent(courtId)}`, body);
    return res.data.data as ClubAdminCourt;
  },
  reorderCourts: async (clubId: string, courtIds: string[]) => {
    const res = await api.post<ApiResponse<ClubAdminCourt[]>>(`${clubPath(clubId)}/courts/reorder`, { courtIds });
    return res.data.data as ClubAdminCourt[];
  },
  getCourtImpact: (clubId: string, courtId: string, opts?: RequestOpts) =>
    get<CourtImpact>(`${clubPath(clubId)}/courts/${encodeURIComponent(courtId)}/impact`, opts),

  getPricing: (clubId: string, opts?: RequestOpts) => get<ClubPricing>(`${clubPath(clubId)}/pricing`, opts),
  putPricing: async (clubId: string, body: PutClubPricingBody) => {
    const res = await api.put<ApiResponse<ClubPricing>>(`${clubPath(clubId)}/pricing`, body);
    return res.data.data as ClubPricing;
  },
  getQuote: (clubId: string, q: { courtId: string; startTime: string; endTime: string }, opts?: RequestOpts) =>
    get<PriceQuote>(`${clubPath(clubId)}/pricing/quote`, { ...opts, params: q }),

  getTeam: (clubId: string, opts?: RequestOpts) => get<ClubTeamMember[]>(`${clubPath(clubId)}/team`, opts),
  addTeamMember: async (clubId: string, body: AddTeamMemberBody) => {
    const res = await api.post<ApiResponse<ClubTeamMember[]>>(`${clubPath(clubId)}/team`, body);
    return res.data.data as ClubTeamMember[];
  },
  changeTeamRole: async (clubId: string, userId: string, role: ClubAdminRole) => {
    const res = await api.patch<ApiResponse<ClubTeamMember[]>>(`${clubPath(clubId)}/team/${encodeURIComponent(userId)}`, { role });
    return res.data.data as ClubTeamMember[];
  },
  removeTeamMember: async (clubId: string, userId: string) => {
    const res = await api.delete<ApiResponse<ClubTeamMember[]>>(`${clubPath(clubId)}/team/${encodeURIComponent(userId)}`);
    return res.data.data as ClubTeamMember[];
  },

  listActivity: (clubId: string, q: { cursor?: string; actions?: readonly ClubActivityAction[] }, opts?: RequestOpts) =>
    get<Paged<ClubActivityItem>>(`${clubPath(clubId)}/activity`, {
      ...opts,
      params: { cursor: q.cursor, action: q.actions?.length ? q.actions.join(',') : undefined },
    }),
  listReviews: (clubId: string, q: { cursor?: string }, opts?: RequestOpts) =>
    get<ClubAdminReviewsResponse>(`${clubPath(clubId)}/reviews`, { ...opts, params: q }),
};
