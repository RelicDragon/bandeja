import { Sport } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';

export const CLUB_SPORT_ORDER: Sport[] = [
  Sport.PADEL,
  Sport.TENNIS,
  Sport.PICKLEBALL,
  Sport.BADMINTON,
  Sport.TABLE_TENNIS,
  Sport.SQUASH,
];

export function normalizeClubSportsOrder(sports: Sport[]): Sport[] {
  const set = new Set(sports);
  return CLUB_SPORT_ORDER.filter((s) => set.has(s));
}

export function parseClubSportsInput(raw: unknown): Sport[] {
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'sports must be an array');
  }
  if (raw.length === 0) {
    throw new ApiError(400, 'sports must include at least one sport');
  }
  const out: Sport[] = [];
  const seen = new Set<Sport>();
  for (const item of raw) {
    if (typeof item !== 'string' || !Object.values(Sport).includes(item as Sport)) {
      throw new ApiError(400, `Invalid sport: ${String(item)}`);
    }
    const sport = item as Sport;
    if (!seen.has(sport)) {
      seen.add(sport);
      out.push(sport);
    }
  }
  return normalizeClubSportsOrder(out);
}

export function assertCourtSportInClub(clubSports: Sport[], courtSport: Sport | null | undefined): void {
  if (courtSport == null) return;
  if (!clubSports.includes(courtSport)) {
    throw new ApiError(400, `Court sport ${courtSport} is not enabled for this club`);
  }
}

export function assertClubSportsCoverCourtSports(
  clubSports: Sport[],
  courtSports: Array<Sport | null | undefined>,
): void {
  for (const courtSport of courtSports) {
    assertCourtSportInClub(clubSports, courtSport ?? null);
  }
}

export function mergeClubSports(clubSports: Sport[], sport: Sport): Sport[] {
  if (clubSports.includes(sport)) return clubSports;
  return normalizeClubSportsOrder([...clubSports, sport]);
}

export async function syncClubSportsFromCourt(
  clubId: string,
  courtSport: Sport | null | undefined,
): Promise<void> {
  if (courtSport == null) return;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { sports: true },
  });
  if (!club) return;
  const sports = mergeClubSports(club.sports, courtSport);
  if (sports.length === club.sports.length) return;
  await prisma.club.update({ where: { id: clubId }, data: { sports } });
}

export function clubSupportsSport(
  clubSports: Sport[],
  courts: Array<{ sport: Sport | null }>,
  sport: Sport,
): boolean {
  if (clubSports.length > 0) {
    return clubSports.includes(sport);
  }
  if (courts.length === 0) return false;
  return courts.some((court) => court.sport == null || court.sport === sport);
}

export function assertClubSupportsSport(
  clubSports: Sport[],
  courts: Array<{ sport: Sport | null }>,
  sport: Sport,
): void {
  if (!clubSupportsSport(clubSports, courts, sport)) {
    throw new ApiError(400, `Club does not support sport ${sport}`);
  }
}

export function assertCourtMatchesGameSport(
  courtSport: Sport | null | undefined,
  gameSport: Sport,
): void {
  if (courtSport != null && courtSport !== gameSport) {
    throw new ApiError(400, `Court sport ${courtSport} does not match game sport ${gameSport}`);
  }
}
