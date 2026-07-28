import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { resolvePublicGamesSportFilter } from '../user/userSportProfile.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { getAvailableGamesCardSelect, FIND_CARD_USER_SELECT } from './availableGamesCard.projection';
import {
  AVAILABLE_GAMES_DAY_TAKE,
  AVAILABLE_GAMES_MAX_TAKE,
  AVAILABLE_GAMES_MONTH_TAKE,
  AVAILABLE_GAMES_UPCOMING_TAKE,
  availableGamesCursorWhere,
  clampAvailableTake,
  decodeAvailableGamesCursor,
  encodeAvailableGamesCursor,
  resolveAvailablePageAfterFilter,
  type AvailableGamesPageMeta,
} from './availableGamesBounds';
import { calendarDateBounds, startOfCalendarDate, endOfCalendarDate, InvalidCalendarDateError } from './calendarDateBounds';
import { enrichAvailableGamesSafe } from './availableGamesEnrichment';
import { filterOrderedRowsByAvailableSlots } from './availableGamesSlotsSql';
import {
  appendStructuralFiltersToWhere,
  type AvailableStructuralFilters,
} from './availableGamesStructuralWhere';
import { formatInTimeZone } from 'date-fns-tz';
import { ApiError } from '../../utils/ApiError';

/** Light startTimes index for calendar badges — no fat card include. */
export const AVAILABLE_GAMES_DAY_INDEX_CAP = 5000;

export type AvailableDayIndexRow = {
  id: string;
  startTime: string;
  sport: string;
  entityType: string;
  minLevel: number | null;
  maxLevel: number | null;
  maxParticipants: number;
  genderTeams: string | null;
  trainerId: string | null;
  clubId: string | null;
  isPublic: boolean;
  timeIsSet: boolean;
  affectsRating: boolean;
  ownerUserId: string | null;
  /** True when the requesting user is a participant (for calendar pills). */
  viewerIsParticipant: boolean;
};

export type AvailableGamesListResult = {
  games: unknown[];
  meta: AvailableGamesPageMeta & {
    dayIndex?: AvailableDayIndexRow[];
    dayIndexTruncated?: boolean;
  };
};

export type AvailableGamesFetchOptions = {
  userId: string;
  userCityId?: string;
  startDate?: string;
  endDate?: string;
  showArchived?: boolean;
  includeLeagues?: boolean;
  sportQuery?: unknown;
  primarySport?: Sport | string | null;
  showPrivateGames?: boolean;
  isAdmin?: boolean;
  structural?: AvailableStructuralFilters;
  take?: number;
  cursor?: string;
  enrich?: boolean;
  order?: 'asc' | 'desc';
  kind: 'calendar' | 'upcoming';
  /** Calendar month badges only — skip fat card page (Find uses day-scoped cards). */
  indexOnly?: boolean;
};

type SlimIdRow = { id: string; startTime: Date };

function buildVisibilityOr(
  userId: string,
  includeLeagues: boolean | undefined,
  includeAllPrivate: boolean,
): Prisma.GameWhereInput[] {
  const visibilityOr: Prisma.GameWhereInput[] = [{ isPublic: true }];
  if (includeAllPrivate) {
    visibilityOr.push({ isPublic: false });
  } else {
    visibilityOr.push({
      isPublic: false,
      participants: { some: { userId } },
    });
  }
  if (includeLeagues) {
    visibilityOr.push({ entityType: 'LEAGUE' }, { entityType: 'LEAGUE_SEASON' });
  }
  return visibilityOr;
}

async function resolveCityId(
  userId: string,
  userCityId?: string,
): Promise<string | undefined> {
  if (userCityId) return userCityId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });
  return user?.currentCityId ?? undefined;
}

async function buildAvailableWhere(
  options: AvailableGamesFetchOptions,
): Promise<{
  where: Prisma.GameWhereInput;
  structuralForMode: AvailableStructuralFilters;
}> {
  const {
    userId,
    includeLeagues,
    sportQuery,
    showPrivateGames,
    isAdmin,
    structural = {},
    kind,
  } = options;

  let viewerPrimarySport = options.primarySport;
  if (viewerPrimarySport === undefined) {
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { primarySport: true },
    });
    viewerPrimarySport = viewer?.primarySport;
  }
  const sportFilter = resolvePublicGamesSportFilter(sportQuery, viewerPrimarySport);
  const includeAllPrivate = Boolean(showPrivateGames && isAdmin);

  const where: Prisma.GameWhereInput = {
    OR: buildVisibilityOr(userId, includeLeagues, includeAllPrivate),
  };

  const cityId = await resolveCityId(userId, options.userCityId);
  if (cityId) where.cityId = cityId;
  // Cached city TZ lookup (same helper as notifications / weather).
  const cityTimezone = await getUserTimezoneFromCityId(cityId ?? null);

  if (kind === 'upcoming') {
    where.status = { not: 'ARCHIVED' };
    const todayKey = formatInTimeZone(new Date(), cityTimezone, 'yyyy-MM-dd');
    const todayStart = startOfCalendarDate(todayKey, cityTimezone);
    const [y, m, d] = todayKey.split('-').map(Number);
    const horizonKey = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const horizon = endOfCalendarDate(horizonKey, cityTimezone);
    // List: untied LEAGUE_SEASON shells stay visible; timed games stay in horizon.
    where.AND = [
      {
        OR: [
          { entityType: 'LEAGUE_SEASON' },
          { startTime: { gte: todayStart, lte: horizon } },
        ],
      },
    ];
  } else {
    if (!options.showArchived) {
      where.status = { not: 'ARCHIVED' };
    }
    if (options.startDate || options.endDate) {
      let startTimeRange: { gte?: Date; lte?: Date };
      try {
        startTimeRange = calendarDateBounds(
          options.startDate,
          options.endDate,
          cityTimezone,
        );
      } catch (err) {
        if (err instanceof InvalidCalendarDateError) {
          throw new ApiError(400, err.message, true, { code: 'validation.invalidDate' });
        }
        throw err;
      }
      // Calendar / day-scoped: every entity (incl. LEAGUE_SEASON) must fall in range.
      // Do not OR-bypass by entityType — that made seasons appear on every selected day.
      where.AND = [{ startTime: startTimeRange }];
    }
  }

  if (sportFilter.mode === 'single') {
    where.sport = sportFilter.sport;
  }

  const structuralForMode: AvailableStructuralFilters = {
    ...structural,
    requireTimeSet: kind === 'calendar' ? true : structural.requireTimeSet,
    allowUnsetTimeLeagueSeason:
      kind === 'upcoming' ? true : structural.allowUnsetTimeLeagueSeason,
  };
  appendStructuralFiltersToWhere(where, structuralForMode);

  return { where, structuralForMode };
}

/**
 * Month badge rows: scalar select only, then one batch for owner/viewer participation.
 */
async function fetchCalendarDayIndex(
  where: Prisma.GameWhereInput,
  availableSlots: boolean | undefined,
  viewerUserId: string,
): Promise<{ dayIndex: AvailableDayIndexRow[]; dayIndexTruncated: boolean }> {
  const rows = await prisma.game.findMany({
    where,
    select: {
      id: true,
      startTime: true,
      sport: true,
      entityType: true,
      minLevel: true,
      maxLevel: true,
      maxParticipants: true,
      genderTeams: true,
      trainerId: true,
      clubId: true,
      isPublic: true,
      timeIsSet: true,
      affectsRating: true,
      court: { select: { clubId: true } },
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: AVAILABLE_GAMES_DAY_INDEX_CAP + 1,
  });

  let list = rows;
  const dayIndexTruncated = list.length > AVAILABLE_GAMES_DAY_INDEX_CAP;
  if (dayIndexTruncated) list = list.slice(0, AVAILABLE_GAMES_DAY_INDEX_CAP);

  if (availableSlots && list.length > 0) {
    list = await filterOrderedRowsByAvailableSlots(list);
  }

  const participantMeta =
    list.length === 0
      ? []
      : await prisma.gameParticipant.findMany({
          where: {
            gameId: { in: list.map((g) => g.id) },
            OR: [{ role: 'OWNER' }, { userId: viewerUserId }],
          },
          select: { gameId: true, userId: true, role: true },
        });

  const ownerByGame = new Map<string, string>();
  const viewerGames = new Set<string>();
  for (const p of participantMeta) {
    if (p.role === 'OWNER' && !ownerByGame.has(p.gameId)) {
      ownerByGame.set(p.gameId, p.userId);
    }
    if (p.userId === viewerUserId) {
      viewerGames.add(p.gameId);
    }
  }

  const dayIndex: AvailableDayIndexRow[] = list.map((g) => ({
    id: g.id,
    startTime: g.startTime.toISOString(),
    sport: g.sport,
    entityType: g.entityType,
    minLevel: g.minLevel,
    maxLevel: g.maxLevel,
    maxParticipants: g.maxParticipants,
    genderTeams: g.genderTeams,
    trainerId: g.trainerId,
    clubId: g.clubId ?? g.court?.clubId ?? null,
    isPublic: g.isPublic,
    timeIsSet: g.timeIsSet,
    affectsRating: g.affectsRating,
    ownerUserId: ownerByGame.get(g.id) ?? null,
    viewerIsParticipant: viewerGames.has(g.id),
  }));

  return { dayIndex, dayIndexTruncated };
}

/** Id-only scan for pagination / open-slots overscan (no card joins). */
async function fetchSlimIdPage(
  pageWhere: Prisma.GameWhereInput,
  order: 'asc' | 'desc',
  fetchTake: number,
): Promise<{ scanned: SlimIdRow[]; scannedHasMore: boolean }> {
  const rows = await prisma.game.findMany({
    where: pageWhere,
    select: { id: true, startTime: true },
    orderBy: [{ startTime: order }, { id: order }],
    take: fetchTake + 1,
  });
  const scannedHasMore = rows.length > fetchTake;
  const scanned = scannedHasMore ? rows.slice(0, fetchTake) : rows;
  return { scanned, scannedHasMore };
}

/** Hydrate card select for page ids; attach FINAL outcomes only; fill missing trainers. */
async function hydrateAvailableGameCards(
  pageIds: string[],
  viewerUserId: string,
): Promise<Map<string, Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (pageIds.length === 0) return byId;

  const games = await prisma.game.findMany({
    where: { id: { in: pageIds } },
    select: getAvailableGamesCardSelect({ viewerUserId }),
  });

  const finalIds = games
    .filter((g) => g.resultsStatus === 'FINAL')
    .map((g) => g.id);

  const outcomesByGame = new Map<string, Array<{ userId: string; position: number | null }>>();
  if (finalIds.length > 0) {
    const outcomeRows = await prisma.gameOutcome.findMany({
      where: {
        gameId: { in: finalIds },
        position: { not: null },
      },
      select: { gameId: true, userId: true, position: true },
      orderBy: { position: 'asc' },
    });
    for (const row of outcomeRows) {
      const list = outcomesByGame.get(row.gameId) ?? [];
      list.push({ userId: row.userId, position: row.position });
      outcomesByGame.set(row.gameId, list);
    }
  }

  // TRAINING cards need the trainer participant even when NON_PLAYING.
  const missingTrainerKeys: Array<{ gameId: string; trainerId: string }> = [];
  for (const game of games) {
    if (game.entityType !== 'TRAINING' || !game.trainerId) continue;
    const hasTrainer = game.participants.some((p) => p.userId === game.trainerId);
    if (!hasTrainer) {
      missingTrainerKeys.push({ gameId: game.id, trainerId: game.trainerId });
    }
  }

  const trainerByGame = new Map<string, unknown>();
  if (missingTrainerKeys.length > 0) {
    const trainerRows = await prisma.gameParticipant.findMany({
      where: {
        OR: missingTrainerKeys.map((k) => ({
          gameId: k.gameId,
          userId: k.trainerId,
        })),
      },
      select: {
        id: true,
        userId: true,
        gameId: true,
        role: true,
        status: true,
        user: {
          select: FIND_CARD_USER_SELECT,
        },
      },
    });
    for (const row of trainerRows) {
      trainerByGame.set(row.gameId, row);
    }
  }

  for (const game of games) {
    const next: Record<string, unknown> = { ...game };
    const participants: unknown[] = [...game.participants];
    const trainerRow = trainerByGame.get(game.id);
    if (trainerRow) {
      participants.push(trainerRow);
    }
    next.participants = participants;
    const outcomes = outcomesByGame.get(game.id);
    if (outcomes && outcomes.length > 0) {
      next.outcomes = outcomes;
    }
    byId.set(game.id, next);
  }

  return byId;
}

export async function fetchAvailableGamesPage(
  options: AvailableGamesFetchOptions,
  project: (game: unknown) => unknown,
): Promise<AvailableGamesListResult> {
  const { userId, enrich = false, kind, indexOnly = false } = options;

  const { where, structuralForMode } = await buildAvailableWhere(options);

  // Month badge path: dayIndex only — selected-day cards come from a separate fetch.
  if (indexOnly && kind === 'calendar') {
    const dayIndexResult = await fetchCalendarDayIndex(
      where,
      structuralForMode.availableSlots,
      userId,
    );
    return {
      games: [],
      meta: {
        take: 0,
        bound: AVAILABLE_GAMES_MAX_TAKE,
        hasMore: false,
        truncated: false,
        nextCursor: null,
        dayIndex: dayIndexResult.dayIndex,
        dayIndexTruncated: dayIndexResult.dayIndexTruncated,
      },
    };
  }

  const singleDay =
    !!options.startDate &&
    !!options.endDate &&
    options.startDate === options.endDate;
  const defaultTake =
    kind === 'upcoming'
      ? AVAILABLE_GAMES_UPCOMING_TAKE
      : singleDay
        ? AVAILABLE_GAMES_DAY_TAKE
        : AVAILABLE_GAMES_MONTH_TAKE;
  const take = clampAvailableTake(options.take, defaultTake);
  const order: 'asc' | 'desc' = options.order ?? 'asc';

  const cursor = decodeAvailableGamesCursor(options.cursor);
  const pageWhere: Prisma.GameWhereInput = { ...where };
  const cursorWhere = availableGamesCursorWhere(cursor, order);
  if (cursorWhere) {
    const and = Array.isArray(pageWhere.AND)
      ? [...pageWhere.AND]
      : pageWhere.AND
        ? [pageWhere.AND]
        : [];
    and.push(cursorWhere as Prisma.GameWhereInput);
    pageWhere.AND = and;
  }

  // Month badges come from indexOnly. Day-scoped card fetches skip dayIndex.
  const wantDayIndex = kind === 'calendar' && !cursor && !singleDay;
  // When open-slots is on, overscan so post-filter pages are not sparse/empty.
  const fetchTake = structuralForMode.availableSlots
    ? Math.min(AVAILABLE_GAMES_MAX_TAKE, Math.max(take * 4, take + 1))
    : take;

  const [idPage, dayIndexResult] = await Promise.all([
    fetchSlimIdPage(pageWhere, order, fetchTake),
    wantDayIndex
      ? fetchCalendarDayIndex(where, structuralForMode.availableSlots, userId)
      : Promise.resolve(null),
  ]);

  let filtered = idPage.scanned;
  if (structuralForMode.availableSlots && filtered.length > 0) {
    filtered = await filterOrderedRowsByAvailableSlots(filtered);
  }

  const { page, hasMore, cursorTip } = resolveAvailablePageAfterFilter(
    idPage.scanned,
    filtered,
    take,
    idPage.scannedHasMore,
  );

  const hydratedById = await hydrateAvailableGameCards(
    page.map((p) => p.id),
    userId,
  );
  const gamesRaw = page
    .map((p) => hydratedById.get(p.id))
    .filter((g): g is Record<string, unknown> => g != null);

  if (gamesRaw.length !== page.length) {
    console.warn('[fetchAvailableGamesPage] hydrate miss', {
      requested: page.length,
      hydrated: gamesRaw.length,
    });
  }

  const meta: AvailableGamesListResult['meta'] = {
    take,
    bound: AVAILABLE_GAMES_MAX_TAKE,
    hasMore,
    truncated: hasMore,
    nextCursor:
      hasMore && cursorTip
        ? encodeAvailableGamesCursor({
            startTime: cursorTip.startTime.toISOString(),
            id: cursorTip.id,
          })
        : null,
  };

  if (dayIndexResult) {
    meta.dayIndex = dayIndexResult.dayIndex;
    meta.dayIndexTruncated = dayIndexResult.dayIndexTruncated;
  }

  let games = gamesRaw.map((g) => project(g));

  if (enrich && games.length > 0) {
    games = await enrichAvailableGamesSafe(userId, games as Array<{ id: string }>);
  }

  return { games, meta };
}
