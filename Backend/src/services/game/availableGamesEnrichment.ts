import prisma from '../../config/database';
import { getUserNotesForGames } from '../userGameNote.service';
import { WeatherForecastService } from '../weatherForecast.service';
import { attachReactionsToGames, fetchReactionsByGameIds } from './gameReaction.service';

export const AVAILABLE_ENRICH_MAX_IDS = 100;

export type AvailableGameEnrichFields = {
  userNote?: string | null;
  weatherSummary?: unknown;
  reactions?: unknown[];
};

/**
 * Attach notes / weather / reactions without failing the core Find path.
 * Any partial failure leaves prior fields on the game intact.
 */
export async function enrichAvailableGamesSafe<T extends {
  id: string;
  cityId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  timeIsSet?: boolean;
}>(
  userId: string,
  games: T[],
): Promise<(T & AvailableGameEnrichFields)[]> {
  if (games.length === 0) return games;

  let result: (T & AvailableGameEnrichFields)[] = games.map((g) => ({ ...g }));

  try {
    const notesMap = await getUserNotesForGames(
      userId,
      result.map((g) => g.id),
    );
    result = result.map((game) => ({
      ...game,
      userNote: notesMap.get(game.id) || null,
    }));
  } catch (err) {
    console.warn('[availableGamesEnrichment] notes failed', err);
  }

  try {
    const withSchedule = result.filter(
      (g): g is T & {
        id: string;
        cityId: string;
        startTime: Date | string;
        endTime: Date | string;
        timeIsSet: boolean;
      } =>
        typeof g.cityId === 'string' &&
        g.startTime != null &&
        g.endTime != null &&
        typeof g.timeIsSet === 'boolean',
    );
    if (withSchedule.length > 0) {
      const weathered = await WeatherForecastService.attachSummariesToGames(withSchedule);
      const byId = new Map(weathered.map((g) => [g.id, g.weatherSummary]));
      result = result.map((game) =>
        byId.has(game.id) ? { ...game, weatherSummary: byId.get(game.id) ?? null } : game,
      );
    }
  } catch (err) {
    console.warn('[availableGamesEnrichment] weather failed', err);
  }

  try {
    const reactionsMap = await fetchReactionsByGameIds(result.map((g) => g.id));
    result = attachReactionsToGames(result, reactionsMap) as (T & AvailableGameEnrichFields)[];
  } catch (err) {
    console.warn('[availableGamesEnrichment] reactions failed', err);
  }

  return result;
}

/**
 * Batch enrich by game ids already loaded on the client (progressive Find TTFP).
 * Returns a map so callers can merge onto cached cards.
 */
export async function enrichAvailableGamesByIds(
  userId: string,
  gameIds: string[],
): Promise<Record<string, AvailableGameEnrichFields>> {
  const unique = [...new Set(gameIds.filter(Boolean))].slice(0, AVAILABLE_ENRICH_MAX_IDS);
  if (unique.length === 0) return {};

  const rows = await prisma.game.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      cityId: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
    },
  });
  const enriched = await enrichAvailableGamesSafe(userId, rows);
  const byId: Record<string, AvailableGameEnrichFields> = {};
  for (const row of enriched) {
    byId[row.id] = {
      userNote: row.userNote ?? null,
      weatherSummary: row.weatherSummary ?? null,
      reactions: row.reactions ?? [],
    };
  }
  return byId;
}
