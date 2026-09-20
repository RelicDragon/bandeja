import prisma from '../../config/database';
import { getUserNotesForGames } from '../userGameNote.service';
import {
  FIND_WEATHER_SOFT_WAIT_MS,
  WeatherForecastService,
} from '../weatherForecast.service';
import { attachReactionsToGames, fetchReactionsByGameIds } from './gameReaction.service';
import type {
  AttendanceSummary,
  LiveGameSummary,
  PerHeadPrice,
  SeriesCardLabel,
  WeatherRisk,
} from './availableGamesEnrichmentTypes';

export const AVAILABLE_ENRICH_MAX_IDS = 100;

export type AvailableGameEnrichFields = {
  userNote?: string | null;
  weatherSummary?: unknown;
  reactions?: unknown[];
  /** PRD 347 — set while the "Spot opened" pill window is still open. */
  spotOpenedAt?: string | null;
  /** PRD 349 — compact live score for the Live now rail. */
  liveSummary?: LiveGameSummary | null;
  /** PRD 357 — rain / wind risk pill for outdoor games within 48 h. */
  weatherRisk?: WeatherRisk | null;
  /** PRD 348 — derived per-player share for the card price row. */
  perHeadPrice?: PerHeadPrice | null;
  /** PRD 345 — `↻ Weekly` card pill and series link. */
  seriesLabel?: SeriesCardLabel | null;
  /** PRD 346 — confirmed / not-yet counts for the right rail. */
  attendanceSummary?: AttendanceSummary | null;
};

/** The card shape every enricher can rely on. Find and My-tab both supply these. */
export type AvailableGamesEnricherInput = {
  id: string;
  cityId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  timeIsSet?: boolean;
};

/**
 * Attaches a PRD's derived fields to a batch of cards, keyed by game id.
 * Return `{}` (not a throw) when there is nothing to attach — but a throw is
 * survivable too: {@link enrichAvailableGamesSafe} catches per enricher.
 *
 * Implementations must be read-only, must issue a **bounded** number of queries
 * (one batched query per call, never one per game) and must tolerate ids they
 * know nothing about.
 */
export type AvailableGamesEnricher = (
  userId: string,
  games: AvailableGamesEnricherInput[],
) => Promise<Record<string, Partial<AvailableGameEnrichFields>>>;

const enrichers = new Map<string, AvailableGamesEnricher>();

/**
 * Registers a card enricher so a feature agent never has to edit this file.
 *
 * Registration must run at import time of a module the app actually loads —
 * the reliable path is the feature's own service module, which its route file
 * imports (all PRD routers are mounted from `routes/index.ts`).
 *
 * Re-registering the same `name` replaces the previous enricher, so a module
 * that is imported twice cannot double-register.
 */
export function registerAvailableGamesEnricher(
  name: string,
  enricher: AvailableGamesEnricher,
): void {
  enrichers.set(name, enricher);
}

/** Introspection for tests / diagnostics. */
export function listAvailableGamesEnricherNames(): string[] {
  return [...enrichers.keys()];
}

/** Test helper — drops every registration so suites stay independent. */
export function resetAvailableGamesEnrichersForTests(): void {
  enrichers.clear();
}

/**
 * Runs every registered enricher concurrently. A failing enricher contributes
 * nothing and never rejects, so one bad PRD can never break Find.
 */
async function runRegisteredEnrichers(
  userId: string,
  games: AvailableGamesEnricherInput[],
): Promise<Record<string, Partial<AvailableGameEnrichFields>>[]> {
  if (enrichers.size === 0) return [];
  const results = await Promise.all(
    [...enrichers.entries()].map(([name, enricher]) =>
      enricher(userId, games).catch((err) => {
        console.warn(`[availableGamesEnrichment] enricher "${name}" failed`, err);
        return null;
      }),
    ),
  );
  return results.filter(
    (r): r is Record<string, Partial<AvailableGameEnrichFields>> => r !== null,
  );
}

/**
 * Attach notes / weather / reactions and every registered enricher without
 * failing the core Find path. Any partial failure leaves prior fields on the
 * game intact.
 */
export async function enrichAvailableGamesSafe<T extends AvailableGamesEnricherInput>(
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

  const [notesMap, weatherById, reactionsMap, registered] = await Promise.all([
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
    runRegisteredEnrichers(userId, games),
  ]);

  let result: (T & AvailableGameEnrichFields)[] = games.map((game) => {
    const next: T & AvailableGameEnrichFields = { ...game };
    if (notesMap) {
      next.userNote = notesMap.get(game.id) || null;
    }
    if (weatherById?.has(game.id)) {
      next.weatherSummary = weatherById.get(game.id) ?? null;
    }
    for (const byId of registered) {
      const fields = byId[game.id];
      if (fields) Object.assign(next, fields);
    }
    return next;
  });

  if (reactionsMap) {
    result = attachReactionsToGames(result, reactionsMap) as (T & AvailableGameEnrichFields)[];
  }

  return result;
}

/**
 * Enrichment fields that always round-trip through the by-ids batch endpoint.
 *
 * `userNote` / `weatherSummary` / `reactions` are set unconditionally below, so
 * they are not repeated here — {@link AllEnrichFieldsEmitted} proves the two
 * lists together cover every field of {@link AvailableGameEnrichFields}. That
 * matters because list queries send `format: 'card'`, which skips inline
 * enrichment: this endpoint is the client's only source for these fields, and
 * the client merge (`Frontend/src/utils/attachAvailableGamesEnrichment.ts`)
 * carries exactly what arrives here.
 */
const ENRICH_FIELD_KEYS = [
  'spotOpenedAt',
  'liveSummary',
  'weatherRisk',
  'perHeadPrice',
  'seriesLabel',
  'attendanceSummary',
] as const;

/** Fails to compile with `T` named in the error when `T` is not `never`. */
type AssertNever<T extends never> = T;

export type AllEnrichFieldsEmitted = AssertNever<
  Exclude<
    keyof AvailableGameEnrichFields,
    (typeof ENRICH_FIELD_KEYS)[number] | 'userNote' | 'weatherSummary' | 'reactions'
  >
>;

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
    where: {
      id: { in: unique },
      /*
       * The viewer gate. Without it this endpoint enriched **any** game id:
       * `seriesLabel` handed out a private weekly game's name, cadence, weekday
       * and local start time, and `perHeadPrice` handed out what the group now
       * pays — to anyone who once held the id, up to 100 ids per request.
       *
       * Same predicate Find itself uses (`availableGamesQuery.ts`
       * `buildVisibilityOr`), plus the parent branch league fixtures rely on.
       * A game the viewer may not see simply produces no entry: an absent key
       * already means "no change" to the client merge, so this is not an
       * existence oracle either.
       */
      OR: [
        { isPublic: true },
        { participants: { some: { userId } } },
        { parent: { participants: { some: { userId } } } },
      ],
    },
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
    const fields: AvailableGameEnrichFields = {
      userNote: row.userNote ?? null,
      weatherSummary: row.weatherSummary ?? null,
      reactions: row.reactions ?? [],
    };
    // Only emit keys an enricher actually produced — an absent key means "no
    // change", while `null` means "explicitly nothing"; the client merges both.
    for (const key of ENRICH_FIELD_KEYS) {
      if (row[key] !== undefined) {
        Object.assign(fields, { [key]: row[key] });
      }
    }
    byId[row.id] = fields;
  }
  return byId;
}
