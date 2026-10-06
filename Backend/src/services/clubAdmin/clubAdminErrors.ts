import type { ClubAdminErrorCode, ClubAdminValidationDetail } from '@bandeja/shared/clubAdmin/contract';
import { ApiError } from '../../utils/ApiError';

/**
 * Every club admin error carries `code` (and optional `details`) in the JSON body
 * (`errorHandler` spreads `ApiError.data`). Contract: `ClubAdminErrorCode`.
 */
export function clubAdminError(
  statusCode: number,
  code: ClubAdminErrorCode,
  message: string = code,
  details?: unknown
): ApiError {
  return new ApiError(statusCode, message, true, {
    code,
    ...(details !== undefined ? { details } : {}),
  });
}

export function clubAdminValidation(field: string, message: string): ApiError {
  const details: ClubAdminValidationDetail[] = [{ field, message }];
  return clubAdminError(400, 'clubAdmin.validation', `${field}: ${message}`, details);
}

export function clubAdminNotFound(what: string): ApiError {
  return clubAdminError(404, 'clubAdmin.notFound', `${what} not found`);
}

export function clubAdminForbidden(message = 'clubAdmin.forbidden'): ApiError {
  return clubAdminError(403, 'clubAdmin.forbidden', message);
}

/** `parseInt` with NaN/range guards; `undefined`/'' → fallback. */
export function parseIntParam(
  raw: unknown,
  field: string,
  opts: { fallback: number; min: number; max: number }
): number {
  if (raw === undefined || raw === null || raw === '') return opts.fallback;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw clubAdminValidation(field, 'must be an integer');
  return Math.min(Math.max(n, opts.min), opts.max);
}
