import { decodeJwtExpMs } from '@/api/authRefresh';

const DEFAULT_ACCESS_LEEWAY_MS = 120_000;

export function booktimeAccessTokenExpiresAtIso(accessToken: string): string | null {
  const expMs = decodeJwtExpMs(accessToken);
  return expMs ? new Date(expMs).toISOString() : null;
}

export function isBooktimeAccessTokenExpired(
  accessToken: string,
  leewayMs = DEFAULT_ACCESS_LEEWAY_MS,
): boolean {
  const expMs = decodeJwtExpMs(accessToken);
  if (!expMs) return false;
  return Date.now() >= expMs - leewayMs;
}
