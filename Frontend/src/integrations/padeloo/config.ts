export const PADELOO_DEFAULT_CANCEL_HOURS = 2;

export const PADELOO_API_URL = 'https://api.padeloo.app/api';

export const PADELOO_BOOKING_DURATIONS = [60, 90, 120] as const;

export type PadelooBookingDuration = number;

export const PADELOO_SESSION_STORAGE_PREFIX = 'padeloo_session_';

export const PADELOO_DEFAULT_WORKING_HOURS = {
  openMinutes: 9 * 60,
  closeMinutes: 22 * 60,
} as const;

export function padelooSessionStorageKey(clubId: string): string {
  return `${PADELOO_SESSION_STORAGE_PREFIX}${clubId}`;
}

export type PadelooStoredSession = {
  accessToken: string;
  externalUserId: string;
  padelooClubId: number;
  email?: string | null;
};
