import prisma from '../../config/database';
import { getUserNotesForGames } from '../userGameNote.service';
import {
  FIND_WEATHER_SOFT_WAIT_MS,
  WeatherForecastService,
} from '../weatherForecast.service';
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

  const gameIds = games.map((g) => g.id);
  const withSchedule = games.filter(
    (g): g is T & {
      id: string;
      cityId: string;
      startTime: Date | string;
      endTime: Date | string;
      timeIsSet: true;
    } =>
      typeof g.cityId === 'string' &&
      g.startTime != null &&
      g.endTime != null &&
      g.timeIsSet === true,
  );

  const [notesMap, weatherById, reactionsMap] = await Promise.all([
    getUserNotesForGames(userId, gameIds).catch((err) => {
      console.warn('[availableGamesEnrichment] notes failed', err);
      return null;
    }),
    withSchedule.length > 0
      ? WeatherForecastService.attachSummariesToGames(withSchedule, {
          refresh: 'background',
          softWaitMs: FIND_WEATHER_SOFT_WAIT_MS,
        })
          .then((weathered) => new Map(weathered.map((g) => [g.id, g.weatherSummary])))
          .catch((err) => {
            console.warn('[availableGamesEnrichment] weather failed', err);
            return null;
          })
      : Promise.resolve(null),
    fetchReactionsByGameIds(gameIds).catch((err) => {
      console.warn('[availableGamesEnrichment] reactions failed', err);
      return null;
    }),
  ]);

  let result: (T & AvailableGameEnrichFields)[] = games.map((game) => {
    const next: T & AvailableGameEnrichFields = { ...game };
    if (notesMap) {
      next.userNote = notesMap.get(game.id) || null;
    }
    if (weatherById?.has(game.id)) {
      next.weatherSummary = weatherById.get(game.id) ?? null;
    }
    return next;
  });

  if (reactionsMap) {
    result = attachReactionsToGames(result, reactionsMap) as (T & AvailableGameEnrichFields)[];
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
