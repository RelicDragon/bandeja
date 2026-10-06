/**
 * Club area reads and writes (profile, hours, courts, pricing, team, activity, reviews).
 * Keys live under the club prefix (`['clubAdmin', 'club', clubId, …]`), so the existing
 * `invalidateAfterClubChange` refreshes them together with the context (setup checklist),
 * schedule columns and the picker. Writes toast the server `code` unless the caller asks to
 * handle validation itself (`clubAdmin.validation` → per-field errors from `details`).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClubActivityAction,
  ClubAdminCourt,
  ClubAdminRole,
  PatchClubProfileBody,
  PutClubHoursBody,
  PutClubPricingBody,
  UpsertCourtBody,
} from '@shared/clubAdmin/contract';
import { clubAdminClubApi } from '@/api/clubAdminClub';
import type { ClubAdminErrorSuffix } from '@/api/clubAdminErrors';
import { clubAdminKeys } from './keys';
import { clubAdminRetry } from './queries';
import { invalidateAfterClubChange } from './invalidation';
import { toastClubAdminError } from './toastError';

export const clubAreaKeys = {
  profile: (clubId: string) => [...clubAdminKeys.club(clubId), 'profile'] as const,
  hours: (clubId: string) => [...clubAdminKeys.club(clubId), 'hours'] as const,
  courts: (clubId: string) => [...clubAdminKeys.club(clubId), 'courts'] as const,
  courtImpact: (clubId: string, courtId: string) => [...clubAdminKeys.club(clubId), 'courtImpact', courtId] as const,
  pricing: (clubId: string) => [...clubAdminKeys.club(clubId), 'pricing'] as const,
  quote: (clubId: string, courtId: string, startTime: string, endTime: string) =>
    [...clubAdminKeys.club(clubId), 'quote', courtId, startTime, endTime] as const,
  team: (clubId: string) => [...clubAdminKeys.club(clubId), 'team'] as const,
  activity: (clubId: string, action: ClubActivityAction | null) =>
    [...clubAdminKeys.club(clubId), 'activity', action ?? 'all'] as const,
  reviews: (clubId: string) => [...clubAdminKeys.club(clubId), 'reviews'] as const,
};

const SETTINGS_STALE_MS = 60_000;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useClubProfileQuery(clubId: string) {
  return useQuery({
    queryKey: clubAreaKeys.profile(clubId),
    queryFn: ({ signal }) => clubAdminClubApi.getProfile(clubId, { signal }),
    staleTime: SETTINGS_STALE_MS,
    retry: clubAdminRetry,
  });
}

export function useClubHoursQuery(clubId: string) {
  return useQuery({
    queryKey: clubAreaKeys.hours(clubId),
    queryFn: ({ signal }) => clubAdminClubApi.getHours(clubId, { signal }),
    staleTime: SETTINGS_STALE_MS,
    retry: clubAdminRetry,
  });
}

export function useClubCourtsQuery(clubId: string) {
  return useQuery({
    queryKey: clubAreaKeys.courts(clubId),
    queryFn: ({ signal }) => clubAdminClubApi.listCourts(clubId, { signal }),
    staleTime: SETTINGS_STALE_MS,
    retry: clubAdminRetry,
  });
}

export function useCourtImpactQuery(clubId: string, courtId: string | null) {
  return useQuery({
    queryKey: clubAreaKeys.courtImpact(clubId, courtId ?? ''),
    queryFn: ({ signal }) => clubAdminClubApi.getCourtImpact(clubId, courtId as string, { signal }),
    enabled: !!courtId,
    staleTime: 0,
    retry: clubAdminRetry,
  });
}

export function useClubPricingQuery(clubId: string) {
  return useQuery({
    queryKey: clubAreaKeys.pricing(clubId),
    queryFn: ({ signal }) => clubAdminClubApi.getPricing(clubId, { signal }),
    staleTime: SETTINGS_STALE_MS,
    retry: clubAdminRetry,
  });
}

export function usePriceQuoteQuery(clubId: string, q: { courtId: string; startTime: string; endTime: string } | null) {
  return useQuery({
    queryKey: clubAreaKeys.quote(clubId, q?.courtId ?? '', q?.startTime ?? '', q?.endTime ?? ''),
    queryFn: ({ signal }) => clubAdminClubApi.getQuote(clubId, q!, { signal }),
    enabled: !!q,
    staleTime: 30_000,
    retry: clubAdminRetry,
  });
}

export function useClubTeamQuery(clubId: string) {
  return useQuery({
    queryKey: clubAreaKeys.team(clubId),
    queryFn: ({ signal }) => clubAdminClubApi.getTeam(clubId, { signal }),
    staleTime: SETTINGS_STALE_MS,
    retry: clubAdminRetry,
  });
}

export function useClubActivityQuery(clubId: string, action: ClubActivityAction | null) {
  return useInfiniteQuery({
    queryKey: clubAreaKeys.activity(clubId, action),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clubAdminClubApi.listActivity(clubId, { cursor: pageParam ?? undefined, action: action ?? undefined }, { signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    retry: clubAdminRetry,
  });
}

export function useClubReviewsQuery(clubId: string) {
  return useInfiniteQuery({
    queryKey: clubAreaKeys.reviews(clubId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => clubAdminClubApi.listReviews(clubId, { cursor: pageParam ?? undefined }, { signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: clubAdminRetry,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Validation is shown per field by the form; every other error toasts. */
const FORM_SILENT: readonly ClubAdminErrorSuffix[] = ['validation'];

export function useSaveClubProfileMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchClubProfileBody) => clubAdminClubApi.patchProfile(clubId, body),
    onSuccess: (profile) => qc.setQueryData(clubAreaKeys.profile(clubId), profile),
    onError: (err) => toastClubAdminError(err, FORM_SILENT),
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}

export function useSaveClubHoursMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutClubHoursBody) => clubAdminClubApi.putHours(clubId, body),
    onSuccess: (hours) => qc.setQueryData(clubAreaKeys.hours(clubId), hours),
    onError: (err) => toastClubAdminError(err, FORM_SILENT),
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}

export interface UpsertCourtVars {
  courtId: string | null;
  body: Partial<UpsertCourtBody>;
}

export function useUpsertCourtMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courtId, body }: UpsertCourtVars) =>
      courtId ? clubAdminClubApi.patchCourt(clubId, courtId, body) : clubAdminClubApi.createCourt(clubId, body as UpsertCourtBody),
    onError: (err) => toastClubAdminError(err),
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}

/** Optimistic: the list takes the new order at once and rolls back on failure. */
export function useReorderCourtsMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation<ClubAdminCourt[], unknown, string[], { previous: ClubAdminCourt[] | undefined }>({
    mutationFn: (courtIds) => clubAdminClubApi.reorderCourts(clubId, courtIds),
    onMutate: async (courtIds) => {
      await qc.cancelQueries({ queryKey: clubAreaKeys.courts(clubId) });
      const previous = qc.getQueryData<ClubAdminCourt[]>(clubAreaKeys.courts(clubId));
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        const next = courtIds.flatMap((id, i) => {
          const court = byId.get(id);
          return court ? [{ ...court, sortOrder: i }] : [];
        });
        qc.setQueryData(clubAreaKeys.courts(clubId), next);
      }
      return { previous };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(clubAreaKeys.courts(clubId), ctx.previous);
      toastClubAdminError(err);
    },
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}

export interface SavePricingVars {
  pricing: PutClubPricingBody;
  /** Courts whose base rate changed: courtId → cents (null = no base rate). */
  baseRates: Record<string, number | null>;
}

/** Base rates first (court rows), then the replace-all pricing PUT. */
export function useSaveClubPricingMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pricing, baseRates }: SavePricingVars) => {
      for (const [courtId, cents] of Object.entries(baseRates)) {
        await clubAdminClubApi.patchCourt(clubId, courtId, { pricePerHourCents: cents });
      }
      return clubAdminClubApi.putPricing(clubId, pricing);
    },
    onSuccess: (pricing) => qc.setQueryData(clubAreaKeys.pricing(clubId), pricing),
    onError: (err) => toastClubAdminError(err, FORM_SILENT),
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}

export type TeamMutationVars =
  | { kind: 'add'; userId: string; role: ClubAdminRole }
  | { kind: 'role'; userId: string; role: ClubAdminRole }
  | { kind: 'remove'; userId: string };

/** `lastAdmin` / `alreadyMember` toast their own message (errors.*). */
export function useTeamMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: TeamMutationVars) =>
      v.kind === 'add'
        ? clubAdminClubApi.addTeamMember(clubId, { userId: v.userId, role: v.role })
        : v.kind === 'role'
          ? clubAdminClubApi.changeTeamRole(clubId, v.userId, v.role)
          : clubAdminClubApi.removeTeamMember(clubId, v.userId),
    onSuccess: (team) => {
      if (Array.isArray(team)) qc.setQueryData(clubAreaKeys.team(clubId), team);
    },
    onError: (err) => toastClubAdminError(err),
    onSettled: () => invalidateAfterClubChange(qc, clubId),
  });
}
