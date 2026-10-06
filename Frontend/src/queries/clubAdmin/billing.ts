/**
 * Billing, payments ledger and reports: keys, reads and writes. Keys stay under the club prefix
 * (`['clubAdmin', 'club', clubId, …]`) so a club refresh covers them. Every money write invalidates
 * schedule, bookings, dashboard and picker (`bookingChangeKeys`) plus charges, payments and reports.
 * No optimistic updates: sheets close on success, errors toast the server code.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  ClubCharge,
  ClubPaymentMethod,
  CreateChargeBody,
  PatchChargeBody,
  RecordPaymentBody,
} from '@shared/clubAdmin/contract';
import { clubAdminBillingApi, type ReportQuery } from '@/api/clubAdminBilling';
import type { ClubAdminErrorSuffix } from '@/api/clubAdminErrors';
import { bookingChangeKeys } from './invalidation';
import { clubAdminKeys } from './keys';
import { clubAdminRetry } from './queries';
import { toastClubAdminError } from './toastError';

export const clubAdminBillingKeys = {
  chargesAll: (clubId: string) => [...clubAdminKeys.club(clubId), 'charge'] as const,
  charge: (clubId: string, chargeId: string) => [...clubAdminKeys.club(clubId), 'charge', chargeId] as const,
  paymentsAll: (clubId: string) => [...clubAdminKeys.club(clubId), 'payments'] as const,
  payments: (clubId: string, from: string, to: string, method: ClubPaymentMethod | null) =>
    [...clubAdminKeys.club(clubId), 'payments', from, to, method ?? 'all'] as const,
  reportsAll: (clubId: string) => [...clubAdminKeys.club(clubId), 'reports'] as const,
  report: (clubId: string, q: ReportQuery) =>
    [...clubAdminKeys.club(clubId), 'reports', q.from, q.to, q.compare ? 'compare' : 'single'] as const,
};

export function billingChangeKeys(clubId: string): QueryKey[] {
  return [
    ...bookingChangeKeys(clubId),
    clubAdminBillingKeys.chargesAll(clubId),
    clubAdminBillingKeys.paymentsAll(clubId),
    clubAdminBillingKeys.reportsAll(clubId),
  ];
}

export function invalidateAfterBillingChange(qc: QueryClient, clubId: string): Promise<void> {
  return Promise.all(billingChangeKeys(clubId).map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => undefined);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useClubReportQuery(clubId: string, q: ReportQuery, enabled = true) {
  return useQuery({
    queryKey: clubAdminBillingKeys.report(clubId, q),
    queryFn: ({ signal }) => clubAdminBillingApi.getReport(clubId, q, { signal }),
    enabled: enabled && !!clubId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    retry: clubAdminRetry,
  });
}

export function useClubChargeQuery(clubId: string, chargeId: string | null | undefined) {
  return useQuery({
    queryKey: clubAdminBillingKeys.charge(clubId, chargeId ?? ''),
    queryFn: ({ signal }) => clubAdminBillingApi.getCharge(clubId, chargeId as string, { signal }),
    enabled: !!clubId && !!chargeId,
    staleTime: 15_000,
    retry: clubAdminRetry,
  });
}

const PAYMENTS_PAGE_SIZE = 50;

export function useClubPaymentsQuery(clubId: string, from: string, to: string, method: ClubPaymentMethod | null) {
  return useInfiniteQuery({
    queryKey: clubAdminBillingKeys.payments(clubId, from, to, method),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clubAdminBillingApi.listPayments(clubId, { from, to, method, cursor: pageParam, limit: PAYMENTS_PAGE_SIZE }, { signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: clubAdminRetry,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function useBillingMutation<V>(
  clubId: string,
  fn: (vars: V) => Promise<ClubCharge>,
  silentCodes: readonly ClubAdminErrorSuffix[] = []
) {
  const qc = useQueryClient();
  return useMutation<ClubCharge, unknown, V>({
    mutationFn: fn,
    onSuccess: (charge) => qc.setQueryData(clubAdminBillingKeys.charge(clubId, charge.id), charge),
    onError: (err) => toastClubAdminError(err, silentCodes),
    onSettled: () => invalidateAfterBillingChange(qc, clubId),
  });
}

export function useCreateChargeMutation(clubId: string) {
  return useBillingMutation<CreateChargeBody>(clubId, (body) => clubAdminBillingApi.createCharge(clubId, body));
}

export function usePatchChargeMutation(clubId: string) {
  return useBillingMutation<{ chargeId: string; body: PatchChargeBody }>(clubId, ({ chargeId, body }) =>
    clubAdminBillingApi.patchCharge(clubId, chargeId, body)
  );
}

/** `paymentExceedsBalance` is shown inline in the sheet, not toasted. */
export function useRecordPaymentMutation(clubId: string) {
  return useBillingMutation<{ chargeId: string; body: RecordPaymentBody }>(
    clubId,
    ({ chargeId, body }) => clubAdminBillingApi.recordPayment(clubId, chargeId, body),
    ['paymentExceedsBalance']
  );
}

export function useVoidPaymentMutation(clubId: string) {
  return useBillingMutation<{ chargeId: string; paymentId: string }>(clubId, ({ chargeId, paymentId }) =>
    clubAdminBillingApi.voidPayment(clubId, chargeId, paymentId)
  );
}
