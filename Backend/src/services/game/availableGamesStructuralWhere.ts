import type { EntityType, Prisma } from '@prisma/client';

/**
 * Structural Find filters — applied in SQL `where` so rows never leave the DB
 * only to be discarded by the client FindFilter Module.
 *
 * FilterSpec (query params → this shape):
 * | Param            | Meaning                                      | Client residual |
 * |------------------|----------------------------------------------|-----------------|
 * | clubIds          | comma-separated club UUIDs                   | time-of-day     |
 * | entityTypes      | GAME,TRAINING,TOURNAMENT,LEAGUE,BAR          | favorite trainer|
 * | hideBar          | true → exclude BAR                           | —               |
 * | levelMin/levelMax| inclusive band overlap on min/maxLevel       | suitable rating |
 * | requireTimeSet   | calendar: timeIsSet must be true             | —               |
 * | (upcoming always)| timeIsSet OR LEAGUE_SEASON                   | —               |
 * | availableSlots   | PLAYING count < maxParticipants (approx)     | MIX gender slots|
 *
 * Viewer-only heuristics stay on the client FindFilter Module:
 * suitable rating, blocked organizer, no-rating discovery, gender MIX precision,
 * favorite trainer chip, panel time-of-day window.
 */

export type AvailableEntityTypeParam =
  | 'GAME'
  | 'TRAINING'
  | 'TOURNAMENT'
  | 'LEAGUE'
  | 'LEAGUE_SEASON'
  | 'BAR';

export type AvailableStructuralFilters = {
  clubIds?: string[];
  entityTypes?: AvailableEntityTypeParam[];
  hideBar?: boolean;
  levelMin?: number;
  levelMax?: number;
  /** Calendar: only games with timeIsSet (day cells need a date). */
  requireTimeSet?: boolean;
  /**
   * Upcoming list: allow LEAGUE_SEASON without time (matches FindFilter list mode).
   * Ignored when requireTimeSet is true.
   */
  allowUnsetTimeLeagueSeason?: boolean;
  availableSlots?: boolean;
};

const DEFAULT_LEVEL_MIN = 1.0;
const DEFAULT_LEVEL_MAX = 7.0;
const LEVEL_EPS = 1e-6;

const ENTITY_TYPE_SET = new Set<string>([
  'GAME',
  'TRAINING',
  'TOURNAMENT',
  'LEAGUE',
  'LEAGUE_SEASON',
  'BAR',
]);

export function parseClubIdsParam(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function parseEntityTypesParam(raw: unknown): AvailableEntityTypeParam[] | undefined {
  if (raw == null || raw === '') return undefined;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is AvailableEntityTypeParam => ENTITY_TYPE_SET.has(s));
  if (parts.length === 0) return undefined;
  // LEAGUE chip → include season shells
  const expanded = new Set<AvailableEntityTypeParam>(parts);
  if (expanded.has('LEAGUE')) expanded.add('LEAGUE_SEASON');
  return [...expanded];
}

export function parseOptionalFloat(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseBoolParam(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === '1';
}

export function parseStructuralFiltersFromQuery(query: {
  clubIds?: unknown;
  entityTypes?: unknown;
  hideBar?: unknown;
  levelMin?: unknown;
  levelMax?: unknown;
  requireTimeSet?: unknown;
  availableSlots?: unknown;
  mode?: unknown;
}): AvailableStructuralFilters {
  const mode = String(query.mode ?? '').toLowerCase();
  const levelMin = parseOptionalFloat(query.levelMin);
  const levelMax = parseOptionalFloat(query.levelMax);
  const levelActive =
    (levelMin != null && levelMin > DEFAULT_LEVEL_MIN + LEVEL_EPS) ||
    (levelMax != null && levelMax < DEFAULT_LEVEL_MAX - LEVEL_EPS);

  return {
    clubIds: parseClubIdsParam(query.clubIds),
    entityTypes: parseEntityTypesParam(query.entityTypes),
    hideBar: parseBoolParam(query.hideBar),
    levelMin: levelActive ? (levelMin ?? DEFAULT_LEVEL_MIN) : undefined,
    levelMax: levelActive ? (levelMax ?? DEFAULT_LEVEL_MAX) : undefined,
    requireTimeSet:
      parseBoolParam(query.requireTimeSet) || mode === 'calendar',
    allowUnsetTimeLeagueSeason: mode !== 'calendar',
    availableSlots: parseBoolParam(query.availableSlots),
  };
}

export function appendStructuralFiltersToWhere(
  where: Prisma.GameWhereInput,
  filters: AvailableStructuralFilters,
): Prisma.GameWhereInput {
  const and: Prisma.GameWhereInput[] = Array.isArray(where.AND)
    ? [...where.AND]
    : where.AND
      ? [where.AND]
      : [];

  if (filters.clubIds && filters.clubIds.length > 0) {
    and.push({
      OR: [
        { clubId: { in: filters.clubIds } },
        { court: { is: { clubId: { in: filters.clubIds } } } },
      ],
    });
  }

  if (filters.entityTypes && filters.entityTypes.length > 0) {
    and.push({
      entityType: { in: filters.entityTypes as EntityType[] },
    });
  }

  if (filters.hideBar) {
    and.push({ entityType: { not: 'BAR' } });
  }

  if (filters.levelMin != null || filters.levelMax != null) {
    const min = filters.levelMin ?? DEFAULT_LEVEL_MIN;
    const max = filters.levelMax ?? DEFAULT_LEVEL_MAX;
    // Overlap: game.maxLevel >= filterMin AND game.minLevel <= filterMax (null = open)
    and.push({
      AND: [
        { OR: [{ maxLevel: null }, { maxLevel: { gte: min } }] },
        { OR: [{ minLevel: null }, { minLevel: { lte: max } }] },
      ],
    });
  }

  if (filters.requireTimeSet) {
    and.push({ timeIsSet: true });
  } else if (filters.allowUnsetTimeLeagueSeason) {
    and.push({
      OR: [{ timeIsSet: true }, { entityType: 'LEAGUE_SEASON' }],
    });
  }

  // availableSlots: Prisma cannot compare PLAYING count to maxParticipants —
  // see filterIdsByAvailableSlots in availableGamesQuery.ts.

  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}
