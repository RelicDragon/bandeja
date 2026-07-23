import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { resolvePublicGamesSportFilter } from '../user/userSportProfile.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { getAvailableGamesCardInclude } from './availableGamesCard.projection';
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
import { filterIdsByAvailableSlots } from './availableGamesSlotsSql';
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
};

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

async function fetchCalendarDayIndex(
  where: Prisma.GameWhereInput,
  availableSlots: boolean | undefined,
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
      participants: {
        where: { role: 'OWNER' },
        select: { userId: true },
        take: 1,
      },
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    take: AVAILABLE_GAMES_DAY_INDEX_CAP + 1,
  });

  let list = rows;
  const dayIndexTruncated = list.length > AVAILABLE_GAMES_DAY_INDEX_CAP;
  if (dayIndexTruncated) list = list.slice(0, AVAILABLE_GAMES_DAY_INDEX_CAP);

  if (availableSlots && list.length > 0) {
    const openIds = new Set(await filterIdsByAvailableSlots(list.map((g) => g.id)));
    list = list.filter((g) => openIds.has(g.id));
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
    ownerUserId: g.participants[0]?.userId ?? null,
  }));

  return { dayIndex, dayIndexTruncated };
}

export async function fetchAvailableGamesPage(
  options: AvailableGamesFetchOptions,
  project: (game: unknown) => unknown,
): Promise<AvailableGamesListResult> {
  const { userId, enrich = false, kind } = options;

  const defaultTake =
    kind === 'upcoming'
      ? AVAILABLE_GAMES_UPCOMING_TAKE
      : options.startDate &&
          options.endDate &&
          options.startDate === options.endDate
        ? AVAILABLE_GAMES_DAY_TAKE
        : AVAILABLE_GAMES_MONTH_TAKE;
  const take = clampAvailableTake(options.take, defaultTake);
  const order: 'asc' | 'desc' = options.order ?? 'asc';

  const { where, structuralForMode } = await buildAvailableWhere(options);

  const cursor = decodeAvailableGamesCursor(options.cursor);
  const pageWhere: Prisma.GameWhereInput = { ...where };
  const cursorWhere = availableGamesCursorWhere(cursor);
  if (cursorWhere) {
    const and = Array.isArray(pageWhere.AND)
      ? [...pageWhere.AND]
      : pageWhere.AND
        ? [pageWhere.AND]
        : [];
    and.push(cursorWhere as Prisma.GameWhereInput);
    pageWhere.AND = and;
  }

  const wantDayIndex = kind === 'calendar' && !cursor;
  // When open-slots is on, overscan so post-filter pages are not sparse/empty.
  const fetchTake = structuralForMode.availableSlots
    ? Math.min(AVAILABLE_GAMES_MAX_TAKE, Math.max(take * 4, take + 1))
    : take;

  const [gamesRaw, dayIndexResult] = await Promise.all([
    prisma.game.findMany({
      where: pageWhere,
      include: getAvailableGamesCardInclude() as Prisma.GameInclude,
      orderBy: [{ startTime: order }, { id: order }],
      take: fetchTake + 1,
    }),
    wantDayIndex
      ? fetchCalendarDayIndex(where, structuralForMode.availableSlots)
      : Promise.resolve(null),
  ]);

  const scannedHasMore = gamesRaw.length > fetchTake;
  const scanned = scannedHasMore ? gamesRaw.slice(0, fetchTake) : gamesRaw;

  let filtered = scanned;
  if (structuralForMode.availableSlots && filtered.length > 0) {
    const openIds = new Set(await filterIdsByAvailableSlots(filtered.map((g) => g.id)));
    filtered = filtered.filter((g) => openIds.has(g.id));
  }

  const { page, hasMore, cursorTip } = resolveAvailablePageAfterFilter(
    scanned,
    filtered,
    take,
    scannedHasMore,
  );

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

  let games = page.map((g) => project(g));

  if (enrich && games.length > 0) {
    games = await enrichAvailableGamesSafe(userId, games as Array<{ id: string }>);
  }

  return { games, meta };
}
