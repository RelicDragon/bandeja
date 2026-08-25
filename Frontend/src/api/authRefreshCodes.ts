export const AUTH_CODES_SKIP_REFRESH = new Set([
  'auth.userNotFound',
  'auth.userInactive',
  'auth.invalidCredentials',
  'auth.phoneLoginRequiresOAuth',
  'auth.clientUpgradeRequired',
]);

export const REFRESH_HARD_REJECT_CODES = new Set([
  'auth.refreshInvalid',
  'auth.refreshExpired',
  'auth.refreshReused',
  'auth.refreshTokenRequired',
  'auth.userInactive',
  'auth.userNotFound',
  'auth.clientUpgradeRequired',
]);

export const REFRESH_RETRYABLE_CODES = new Set([
  'auth.refreshReused',
  'auth.refreshBusy',
  'auth.refreshInvalid',
]);

export function isHardRefreshReject(code: string | null | undefined): boolean {
  return !!code && REFRESH_HARD_REJECT_CODES.has(code);
}

export function isRetryableRefreshCode(code: string | null | undefined, attempt: number, maxAttempts = 3): boolean {
  return !!code && REFRESH_RETRYABLE_CODES.has(code) && attempt + 1 < maxAttempts;
}
