import type { EntityType, Prisma } from '@prisma/client';

/**
 * Structural Find filters — applied in SQL `where` so rows never leave the DB
 * only to be discarded by the client FindFilter Module.
 *
 * FilterSpec (query params → this shape):
 * | Param            | Meaning                                      | Client residual |
 * |------------------|----------------------------------------------|-----------------|
 * | clubIds          | comma-separated club UUIDs                   | time-of-day     |
 * | entityTypes      | GAME,TRAINING,TOURNAMENT,LEAGUE,BAR,EVENT    | favorite trainer|
 * | (idle upcoming)  | omit EVENT from list river                   | —               |
 * | (idle calendar)  | include EVENT on day cells                   | —               |
 * | hideBar          | true → exclude BAR                           | —               |
 * | levelMin/levelMax| inclusive band overlap on min/maxLevel       | suitable rating |
 * | requireTimeSet   | calendar: timeIsSet must be true             | —               |
 * | (upcoming always)| timeIsSet OR LEAGUE_SEASON                   | —               |
 * | availableSlots   | PLAYING count < maxParticipants (SQL on ids) | MIX gender slots|
 * | noviceOnly       | suitableForNovices = true (PRD 360)          | —               |
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
  | 'BAR'
  | 'EVENT';

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
  /**
   * PRD 360 — only games whose organizer turned "Novices welcome" on. ANDed
   * with every other filter, exactly like the rest of the advanced panel.
   */
  noviceOnly?: boolean;
  /**
   * PRD 349 — "Live now" rail. Narrows to games that are being scored right
   * now **and** are visible to strangers ({@link LIVE_RAIL_WHERE}).
   *
   * Every condition is load-bearing and must stay together: a private game or
   * a game whose organizer switched "Show on Live now" off must never reach
   * the rail, `/live` in Telegram, or the spectator-token endpoint.
   */
  liveOnly?: boolean;
};

/**
 * Who may appear on a Live-now surface at all, whatever the phase: a public
 * game, or a league fixture of a public season — and never one whose organizer
 * opted out.
 *
 * League fixtures are *always* created private (`league/gameCreation.util.ts`)
 * so a stranger cannot join them from Find; the season's own `isPublic` is the
 * real privacy flag, and its rounds and standings are already readable by any
 * signed-in user. A fixture of a private season stays off every surface.
 *
 * The `OR` sits at the top level: spread this only into a where that has no
 * `OR` of its own (or nest it inside an `AND`, as `appendStructuralFiltersToWhere` does).
 */
export const LIVE_RAIL_VISIBLE_WHERE: Prisma.GameWhereInput = {
  showOnLiveRail: true,
  OR: [
    { isPublic: true },
    { entityType: 'LEAGUE', parentId: { not: null }, parent: { is: { isPublic: true } } },
  ],
};

/**
 * The privacy gate for every *live* surface: rail-visible and being scored now.
 * Exported so the rail query, the spectator-token mint and redemption, and
 * their tests all use the *same* object.
 */
export const LIVE_RAIL_WHERE: Prisma.GameWhereInput = {
  resultsStatus: 'IN_PROGRESS',
  ...LIVE_RAIL_VISIBLE_WHERE,
};

/** In-memory twin of {@link LIVE_RAIL_VISIBLE_WHERE}, for a row already loaded. */
export function isLiveRailVisible(game: {
  isPublic: boolean;
  showOnLiveRail: boolean;
  entityType: string;
  parentId: string | null;
  parent: { isPublic: boolean } | null;
}): boolean {
  if (!game.showOnLiveRail) return false;
  if (game.isPublic) return true;
  return game.entityType === 'LEAGUE' && game.parentId !== null && game.parent?.isPublic === true;
}

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
  'EVENT',
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
  noviceOnly?: unknown;
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
    noviceOnly: parseBoolParam(query.noviceOnly),
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

  // PRD 349 — applied first so the privacy gate is never conditional on any
  // other filter succeeding.
  if (filters.liveOnly) {
    and.push({ ...LIVE_RAIL_WHERE });
  }

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
  } else if (!filters.requireTimeSet) {
    and.push({ entityType: { not: 'EVENT' } });
  }

  if (filters.hideBar) {
    and.push({ entityType: { not: 'BAR' } });
  }

  if (filters.levelMin != null || filters.levelMax != null) {
    const min = filters.levelMin ?? DEFAULT_LEVEL_MIN;
    const max = filters.levelMax ?? DEFAULT_LEVEL_MAX;
    // Overlap: game.maxLevel >= filterMin AND game.minLevel <= filterMax (null = open)
    and.push({
      OR: [
        { entityType: 'BAR' },
        {
          AND: [
            { OR: [{ maxLevel: null }, { maxLevel: { gte: min } }] },
            { OR: [{ minLevel: null }, { minLevel: { lte: max } }] },
          ],
        },
      ],
    });
  }

  // PRD 360 — a plain column test, so it narrows the day index and the
  // pagination bounds the same way every other structural filter does.
  if (filters.noviceOnly) {
    and.push({ suitableForNovices: true });
  }

  if (filters.requireTimeSet) {
    and.push({ timeIsSet: true });
  } else if (filters.allowUnsetTimeLeagueSeason) {
    and.push({
      OR: [{ timeIsSet: true }, { entityType: 'LEAGUE_SEASON' }],
    });
  }

  // availableSlots: applied in SQL via filterOrderedRowsByAvailableSlots after
  // an id-only scan (Prisma cannot compare PLAYING count to maxParticipants).

  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}
