/**
 * Club admin console error model. Backend errors carry `{ success: false, message, code, details? }`
 * (`ClubAdminErrorCode` in the shared contract). Store builds talk to older backends, so
 * an endpoint the server does not know yet answers a bare 404 (no `code`) — that is "not
 * supported", never "not found".
 */
import { isAxiosError } from 'axios';
import type {
  ClubAdminErrorCode,
  HoldOverlapDetails,
} from '@shared/clubAdmin/contract';

const CODE_PREFIX = 'clubAdmin.';

/** Error code without its namespace prefix, e.g. `holdOverlap`. */
export type ClubAdminErrorSuffix = ClubAdminErrorCode extends `clubAdmin.${infer S}` ? S : never;

export interface ParsedClubAdminError {
  status: number | null;
  code: ClubAdminErrorCode | null;
  /** `code` without its prefix — the i18n key under errors.* in the club admin namespace. */
  suffix: ClubAdminErrorSuffix | null;
  message: string | null;
  details: unknown;
  /** No response at all (offline, DNS, CORS, timeout). */
  network: boolean;
  /** Request was aborted by us (query cancelled). */
  aborted: boolean;
}

function readBody(err: unknown): Record<string, unknown> | null {
  if (!isAxiosError(err)) return null;
  const data = err.response?.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

export function parseClubAdminError(err: unknown): ParsedClubAdminError {
  const body = readBody(err);
  const rawCode = typeof body?.code === 'string' ? body.code : null;
  const code = rawCode && rawCode.startsWith(CODE_PREFIX) ? (rawCode as ClubAdminErrorCode) : null;
  const axios = isAxiosError(err);
  const aborted = axios ? err.code === 'ERR_CANCELED' : err instanceof DOMException && err.name === 'AbortError';
  return {
    status: axios ? (err.response?.status ?? null) : null,
    code,
    suffix: code ? (code.slice(CODE_PREFIX.length) as ClubAdminErrorSuffix) : null,
    message: typeof body?.message === 'string' ? body.message : null,
    details: body?.details,
    network: axios && !err.response && !aborted,
    aborted,
  };
}

/** The server does not implement this endpoint yet (older backend). */
export function isEndpointMissing(err: unknown): boolean {
  const parsed = parseClubAdminError(err);
  return parsed.status === 404 && parsed.code === null;
}

export function isClubAdminForbidden(err: unknown): boolean {
  const parsed = parseClubAdminError(err);
  return parsed.status === 403;
}

export function holdOverlapDetails(err: unknown): HoldOverlapDetails | null {
  const parsed = parseClubAdminError(err);
  if (parsed.suffix !== 'holdOverlap') return null;
  const details = parsed.details as Partial<HoldOverlapDetails> | undefined;
  return { overlaps: Array.isArray(details?.overlaps) ? details.overlaps : [] };
}

/** i18n key (in the `clubAdmin` namespace) describing an error to the operator. */
export function clubAdminErrorMessageKey(err: unknown): string {
  const parsed = parseClubAdminError(err);
  if (parsed.suffix) return `errors.${parsed.suffix}`;
  if (parsed.network) return 'errors.network';
  if (parsed.status === 403) return 'errors.forbidden';
  if (parsed.status === 404) return 'errors.notFound';
  if (parsed.status === 409) return 'errors.conflict';
  return 'errors.generic';
}
