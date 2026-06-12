export const BOOKTIME_API_URL = 'https://api.booktime.rs';

/** Padel City Centar — Novi Sad */
export const PADEL_CITY_COMPANY_ID = 'd4130d78-a7e8-499d-90f0-92773ccc2f9c';

export const BOOKTIME_SESSION_STORAGE_PREFIX = 'booktime_session_';

export function booktimeSessionStorageKey(clubId: string): string {
  return `${BOOKTIME_SESSION_STORAGE_PREFIX}${clubId}`;
}

export type BooktimeStoredSession = {
  accessToken: string;
  refreshToken: string;
  externalUserId: string;
  companyId: string;
};
