/**
 * Club admin billing, payments ledger and reports (console v2 only — no legacy fallback: these
 * screens do not exist against an older backend). Paths and semantics: `docs/domains/club-admin.md`
 * (Billing, Reports) and `@shared/clubAdmin/contract`.
 */
import { isAxiosError } from 'axios';
import api from './axios';
import type { ApiResponse } from '@/types';
import type {
  ClubCharge,
  ClubPaymentMethod,
  ClubReport,
  CreateChargeBody,
  PatchChargeBody,
  PaymentLedgerResponse,
  RecordPaymentBody,
} from '@shared/clubAdmin/contract';

type RequestOpts = { signal?: AbortSignal };

export type ReportCsvDataset = 'bookings' | 'payments' | 'players';

export interface ReportQuery {
  from: string;
  to: string;
  compare: boolean;
}

export interface PaymentsQuery {
  from: string;
  to: string;
  method?: ClubPaymentMethod | null;
  cursor?: string | null;
  limit?: number;
}

const clubPath = (clubId: string) => `/club-admin/clubs/${encodeURIComponent(clubId)}`;
const chargePath = (clubId: string, chargeId: string) => `${clubPath(clubId)}/charges/${encodeURIComponent(chargeId)}`;

/**
 * A blob request that failed carries its JSON error body as a Blob; turn it back into an object so
 * the usual `{ code }` error parsing (`parseClubAdminError`) works on it.
 */
export async function normalizeBlobError(err: unknown): Promise<unknown> {
  if (!isAxiosError(err) || !err.response) return err;
  const data: unknown = err.response.data;
  if (typeof Blob === 'undefined' || !(data instanceof Blob)) return err;
  try {
    err.response.data = JSON.parse(await data.text());
  } catch {
    err.response.data = null;
  }
  return err;
}

export const clubAdminBillingApi = {
  getReport: async (clubId: string, q: ReportQuery, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubReport>>(`${clubPath(clubId)}/reports`, {
      params: { from: q.from, to: q.to, ...(q.compare ? { compare: 1 } : {}) },
      signal: opts?.signal,
    });
    return res.data.data!;
  },

  /** Authenticated CSV download (the token is a header, so a plain link would not work). */
  exportReportCsv: async (clubId: string, q: { from: string; to: string; dataset: ReportCsvDataset }): Promise<Blob> => {
    try {
      const res = await api.get<Blob>(`${clubPath(clubId)}/reports/export.csv`, {
        params: q,
        responseType: 'blob',
      });
      return res.data;
    } catch (e) {
      throw await normalizeBlobError(e);
    }
  },

  getCharge: async (clubId: string, chargeId: string, opts?: RequestOpts) => {
    const res = await api.get<ApiResponse<ClubCharge>>(chargePath(clubId, chargeId), { signal: opts?.signal });
    return res.data.data!;
  },

  createCharge: async (clubId: string, body: CreateChargeBody) => {
    const res = await api.post<ApiResponse<ClubCharge>>(`${clubPath(clubId)}/charges`, body);
    return res.data.data!;
  },

  patchCharge: async (clubId: string, chargeId: string, body: PatchChargeBody) => {
    const res = await api.patch<ApiResponse<ClubCharge>>(chargePath(clubId, chargeId), body);
    return res.data.data!;
  },

  recordPayment: async (clubId: string, chargeId: string, body: RecordPaymentBody) => {
    const res = await api.post<ApiResponse<ClubCharge>>(`${chargePath(clubId, chargeId)}/payments`, body);
    return res.data.data!;
  },

  voidPayment: async (clubId: string, chargeId: string, paymentId: string) => {
    const res = await api.delete<ApiResponse<ClubCharge>>(
      `${chargePath(clubId, chargeId)}/payments/${encodeURIComponent(paymentId)}`
    );
    return res.data.data!;
  },

  listPayments: async (clubId: string, q: PaymentsQuery, opts?: RequestOpts) => {
    const params: Record<string, string | number> = { from: q.from, to: q.to };
    if (q.method) params.method = q.method;
    if (q.cursor) params.cursor = q.cursor;
    if (q.limit) params.limit = q.limit;
    const res = await api.get<ApiResponse<PaymentLedgerResponse>>(`${clubPath(clubId)}/payments`, {
      params,
      signal: opts?.signal,
    });
    return res.data.data!;
  },
};
