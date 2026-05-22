import type { Court, Sport } from '@/types';
import { SPORT_IDS } from '@/sport/sportRegistry';

const SPORT_ORDER: Sport[] = [...SPORT_IDS];

export function getDistinctCourtSports(courts: Court[]): Sport[] {
  const set = new Set<Sport>();
  for (const court of courts) {
    if (court.sport) set.add(court.sport);
  }
  return SPORT_ORDER.filter((s) => set.has(s));
}

export function shouldShowCourtSportTabs(courts: Court[]): boolean {
  return getDistinctCourtSports(courts).length >= 2;
}

export function courtMatchesSportFilter(court: Court, sport: Sport | undefined): boolean {
  if (!sport) return true;
  return court.sport == null || court.sport === sport;
}

export function filterCourtsBySport(courts: Court[], sport: Sport | undefined): Court[] {
  if (!sport) return courts;
  return courts.filter((c) => courtMatchesSportFilter(c, sport));
}

export function resolveDefaultCourtSportTab(
  sports: Sport[],
  preferred?: Sport | null,
): Sport | undefined {
  if (sports.length === 0) return undefined;
  if (preferred && sports.includes(preferred)) return preferred;
  return sports[0];
}

export function sportLabelKey(sport: Sport): string {
  const map: Record<Sport, string> = {
    PADEL: 'sport.padel',
    TENNIS: 'sport.tennis',
    PICKLEBALL: 'sport.pickleball',
    BADMINTON: 'sport.badminton',
    TABLE_TENNIS: 'sport.tableTennis',
    SQUASH: 'sport.squash',
  };
  return map[sport];
}
