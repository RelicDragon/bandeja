import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../ApiError';
import { resolveSport } from '../../sport/sportRegistry';

export type LeagueSeasonSportSource = {
  sport?: Sport | null;
  game?: { sport?: Sport | null } | null;
};

export function resolveLeagueSeasonSport(source: LeagueSeasonSportSource): Sport {
  if (source.sport) return source.sport;
  if (source.game?.sport) return source.game.sport;
  return Sport.PADEL;
}

export function assertGameSportMatchesLeagueSeason(
  gameSport: Sport,
  season: LeagueSeasonSportSource,
): void {
  const seasonSport = resolveLeagueSeasonSport(season);
  if (gameSport !== seasonSport) {
    throw new ApiError(
      400,
      `Game sport ${gameSport} does not match league season sport ${seasonSport}`,
    );
  }
}

export async function loadLeagueSeasonSportOrThrow(
  leagueSeasonId: string,
  db: { leagueSeason: typeof prisma.leagueSeason } = prisma,
): Promise<Sport> {
  const season = await db.leagueSeason.findUnique({
    where: { id: leagueSeasonId },
    select: { sport: true, game: { select: { sport: true } } },
  });
  if (!season) {
    throw new ApiError(404, 'League season not found');
  }
  return resolveLeagueSeasonSport(season);
}

export function resolveLeagueSeasonSportFromInput(sport: unknown): Sport {
  return resolveSport(sport);
}
