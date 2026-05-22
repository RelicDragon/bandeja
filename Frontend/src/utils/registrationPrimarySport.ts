import { DEFAULT_SPORT, parseSport, type Sport } from '@shared/sport';

const STORAGE_KEY = 'bandeja.registrationPrimarySport';

export const DEFAULT_REGISTRATION_SPORT: Sport = DEFAULT_SPORT;

export function readRegistrationPrimarySport(): Sport {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return parseSport(raw, DEFAULT_REGISTRATION_SPORT);
  } catch {
    /* ignore */
  }
  return DEFAULT_REGISTRATION_SPORT;
}

export function writeRegistrationPrimarySport(sport: Sport): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, sport);
  } catch {
    /* ignore */
  }
}
