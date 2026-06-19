import type { Club, Court, Sport } from '@/types';
import { SPORT_IDS } from '@/sport/sportRegistry';

export type ClubSportFilterInput = Pick<Club, 'sports'> & {
  courts?: Pick<Court, 'sport'>[];
};

const SPORT_ORDER: Sport[] = [...SPORT_IDS];

/** Distinct sports from courts (fallback when club.sports is empty). */
export function getDistinctCourtSports(courts: Court[]): Sport[] {
  const set = new Set<Sport>();
  for (const court of courts) {
    if (court.sport) set.add(court.sport);
  }
  return SPORT_ORDER.filter((s) => set.has(s));
}

export function resolveClubSportsList(
  clubSports: Sport[] | undefined | null,
  courts: Court[],
): Sport[] {
  if (clubSports && clubSports.length > 0) {
    return SPORT_ORDER.filter((s) => clubSports.includes(s));
  }
  return getDistinctCourtSports(courts);
}

export function shouldShowCourtSportTabs(
  clubSports: Sport[] | undefined | null,
  courts: Court[],
): boolean {
  return resolveClubSportsList(clubSports, courts).length >= 2;
}

export function courtMatchesSportFilter(court: Court, sport: Sport | undefined): boolean {
  if (!sport) return true;
  return court.sport == null || court.sport === sport;
}

export function filterCourtsBySport(courts: Court[], sport: Sport | undefined): Court[] {
  if (!sport) return courts;
  return courts.filter((c) => courtMatchesSportFilter(c, sport));
}

export function clubSupportsSport(club: ClubSportFilterInput, sport: Sport): boolean {
  if (club.sports && club.sports.length > 0) {
    return club.sports.includes(sport);
  }
  const courts = club.courts ?? [];
  if (courts.length === 0) return false;
  return filterCourtsBySport(courts as Court[], sport).length > 0;
}

export function filterClubsBySport<T extends ClubSportFilterInput & Pick<Club, 'id'>>(
  clubs: T[],
  sport: Sport,
  keepClubId?: string,
): T[] {
  return clubs.filter(
    (club) => clubSupportsSport(club, sport) || (keepClubId != null && club.id === keepClubId),
  );
}

export function filterCourtsByClubSports(courts: Court[], clubSports: Sport[] | undefined | null): Court[] {
  if (!clubSports || clubSports.length === 0) return courts;
  return courts.filter((c) => c.sport == null || clubSports.includes(c.sport));
}

export function effectiveCourtSportFilter(
  clubSports: Sport[] | undefined | null,
  sport: Sport | undefined,
): Sport | undefined {
  if (!sport) return undefined;
  if (clubSports && clubSports.length > 0 && !clubSports.includes(sport)) {
    return undefined;
  }
  return sport;
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
