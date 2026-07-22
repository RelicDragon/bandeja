export const KLIKTEREN_DEFAULT_CANCEL_HOURS = 2;

export const KLIKTEREN_API_URL = 'https://api.klikteren.com';

export const KLIKTEREN_BOOKING_DURATIONS = [60, 90, 120] as const;

export const KLIKTEREN_SLOT_STEP_MINUTES = 30;

export const KLIKTEREN_MIN_SLOTS_PER_BOOKING = 2;

export type KlikterenBookingDuration = number;

export const KLIKTEREN_SESSION_STORAGE_PREFIX = 'klikteren_session_';

export const KLIKTEREN_DEFAULT_WORKING_HOURS = {
  openMinutes: 8 * 60,
  closeMinutes: 23 * 60,
} as const;

export function klikterenSessionStorageKey(clubId: string): string {
  return `${KLIKTEREN_SESSION_STORAGE_PREFIX}${clubId}`;
}

export type KlikterenStoredSession = {
  accessToken: string;
  externalUserId: string;
  klikterenVenueId: string;
  email?: string | null;
};
