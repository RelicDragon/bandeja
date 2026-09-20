import {
  EntityType,
  GameSeriesCadence,
  GameSeriesStatus,
  ParticipantRole,
  Prisma,
  type Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { TtlCache } from '../../utils/ttlCache';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { GameUpdateService } from '../game/update.service';
import { GameDeleteService } from '../game/delete.service';
import {
  projectAvailableGameCardPayload,
  projectGameUsersForSportContext,
} from '../game/read.service';
import { getAvailableGamesCardSelect } from '../game/availableGamesCard.projection';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import {
  alignDayKeyToWeekday,
  dayKeyInTimezone,
  dayKeyToPrismaDate,
  horizonThroughDayKey,
  isDayKey,
  isLocalTimeString,
  isoWeekdayOfDayKey,
  listOccurrenceDayKeys,
  localTimeInTimezone,
  nextOccurrenceOnOrAfter,
  nextWeekdayAfterDayKey,
  occurrenceEndUtc,
  occurrenceStartUtc,
  prismaDateToDayKey,
  seatDeadlineFor,
  type DayKey,
  type GameSeriesCadenceValue,
} from './gameSeriesOccurrenceDates';
import {
  buildGameSeriesTemplate,
  mergeGameSeriesTemplate,
  parseGameSeriesTemplate,
  withAnchorDayKey,
  type GameSeriesTemplate,
} from './gameSeriesTemplate';
import {
  partitionOccurrencesForFutureEdit,
  selectDeletableOccurrences,
  type GameSeriesEditScope,
  type OccurrenceForScope,
} from './gameSeriesEditScope';
import { GameSeriesGenerationService } from './gameSeriesGeneration.service';
import {
  canRemoveSeriesRegular,
  isSeriesInsider,
  isSeriesManager,
} from './gameSeriesAccess';

/**
 * PRD 345 — recurring game series.
 *
 * A series owns a *template* and a *regular roster*; every week it spawns an
 * ordinary `Game`. Nothing in this file bypasses the normal game rules: creation
 * goes through `GameCreateService`, edits through `GameUpdateService`, deletion
 * through `GameDeleteService` (which refuses anything with results or children —
 * we collect its refusals and report them rather than forcing).
 */

/** Abuse bound: one user may own at most this many `ACTIVE` series. */
export const MAX_ACTIVE_SERIES_PER_USER = 10;

/** Allowed values for the "release unclaimed seats N h before" stepper. */
export const SEAT_DEADLINE_HOUR_CHOICES = [24, 48, 72] as const;

export const DEFAULT_HORIZON_DAYS = 14;
export const MIN_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 60;

/** Entity types that may recur. Events, leagues and league seasons may not. */
export const SERIES_ELIGIBLE_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.GAME,
  EntityType.TRAINING,
  EntityType.TOURNAMENT,
];

/** `GET /series/:id` is read-heavy and fully derived — a short TTL is enough. */
export const SERIES_DETAIL_CACHE_TTL_MS = 60_000;

const seriesDetailCache = new TtlCache<string, SeriesDetail>(SERIES_DETAIL_CACHE_TTL_MS);

const detailCacheKey = (seriesId: string, viewerId: string): string => `${seriesId}:${viewerId}`;

/** Drop every cached projection of one series (all viewers). */
export function invalidateSeriesDetailCache(seriesId: string): void {
  for (const key of seriesDetailCache.keys()) {
    if (key.startsWith(`${seriesId}:`)) seriesDetailCache.delete(key);
  }
}

export interface SeriesRegularSummary {
  user: unknown;
  addedAt: string;
  gamesPlayed: number;
  wins: number;
  /** 0–100, or `null` when the regular has no rated occurrence yet. */
  winRate: number | null;
  /** Share of past occurrences this regular actually played, 0–100. */
  attendanceRate: number | null;
  /** PLAYING on the next generated occurrence. */
  confirmedForNext: boolean;
}

export interface SeriesSkipSummary {
  occurrenceDate: DayKey;
  /** Still ahead, so the organizer can undo it. */
  undoable: boolean;
}

export interface SeriesViewerStats {
  games: number;
  winRate: number | null;
  streakWeeks: number;
}

export interface SeriesDetail {
  series: {
    id: string;
    name: string;
    entityType: EntityType;
    cadence: GameSeriesCadence;
    weekday: number;
    startTimeLocal: string;
    durationMinutes: number;
    horizonDays: number;
    seatDeadlineHours: number;
    endsOn: DayKey | null;
    status: GameSeriesStatus;
    groupChannelId: string | null;
    clubId: string | null;
    courtIds: string[];
    timezone: string;
    createdAt: string;
    endedAt: string | null;
    owner: unknown;
    isOwner: boolean;
    occurrenceCount: number;
  };
  upcoming: unknown[];
  past: unknown[];
  /** Occurrence dates inside the horizon that will be generated but do not exist yet. */
  plannedDayKeys: DayKey[];
  skips: SeriesSkipSummary[];
  regulars: SeriesRegularSummary[];
  stats: SeriesViewerStats;
  nextOccurrence: {
    gameId: string;
    startTime: string;
    occurrenceDate: DayKey;
    seatDeadlineAt: string;
    confirmedCount: number;
    regularCount: number;
    viewerIsPlaying: boolean;
  } | null;
}

const seriesCoreSelect = {
  id: true,
  ownerId: true,
  name: true,
  entityType: true,
  cadence: true,
  weekday: true,
  startTimeLocal: true,
  durationMinutes: true,
  clubId: true,
  courtIds: true,
  template: true,
  horizonDays: true,
  seatDeadlineHours: true,
  endsOn: true,
  status: true,
  groupChannelId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GameSeriesSelect;

type SeriesCore = Prisma.GameSeriesGetPayload<{ select: typeof seriesCoreSelect }>;

async function loadSeriesOrThrow(seriesId: string): Promise<SeriesCore> {
  const series = await prisma.gameSeries.findUnique({
    where: { id: seriesId },
    select: seriesCoreSelect,
  });
  if (!series) {
    throw new ApiError(404, 'errors.series.notFound', true, { code: 'series.notFound' });
  }
  return series;
}

async function assertSeriesOwner(series: SeriesCore, userId: string, isAdmin = false): Promise<void> {
  if (isSeriesManager({ seriesOwnerId: series.ownerId, actorId: userId, isAdmin })) return;
  throw new ApiError(403, 'errors.series.notOwner', true, { code: 'series.notOwner' });
}

/**
 * Is this viewer entitled to the series-private payload (roster, occurrence
 * history, next-occurrence id)? Three memberships count: owner (or platform
 * admin), active regular, or participant of any occurrence. Owners and admins
 * are answered without touching the database.
 */
async function viewerIsSeriesInsider(
  seriesId: string,
  ownerId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isSeriesManager({ seriesOwnerId: ownerId, actorId: viewerId, isAdmin })) return true;
  if (viewerId.length === 0) return false;

  const [regular, participant] = await Promise.all([
    prisma.gameSeriesRegular.findUnique({
      where: { seriesId_userId: { seriesId, userId: viewerId } },
      select: { removedAt: true },
    }),
    prisma.gameParticipant.findFirst({
      where: { userId: viewerId, game: { seriesId } },
      select: { id: true },
    }),
  ]);

  return isSeriesInsider({
    viewerId,
    seriesOwnerId: ownerId,
    isAdmin,
    viewerIsActiveRegular: Boolean(regular) && regular?.removedAt == null,
    viewerIsOccurrenceParticipant: participant !== null,
  });
}

async function seriesTimezone(series: SeriesCore): Promise<string> {
  const template = parseGameSeriesTemplate(series.template);
  if (template?.cityId) return getUserTimezoneFromCityId(template.cityId);
  if (series.clubId) {
    const club = await prisma.club.findUnique({
      where: { id: series.clubId },
      select: { cityId: true },
    });
    if (club?.cityId) return getUserTimezoneFromCityId(club.cityId);
  }
  const occurrence = await prisma.game.findFirst({
    where: { seriesId: series.id },
    select: { cityId: true },
    orderBy: { startTime: 'desc' },
  });
  return getUserTimezoneFromCityId(occurrence?.cityId ?? null);
}

function templateOrThrow(series: SeriesCore): GameSeriesTemplate {
  const template = parseGameSeriesTemplate(series.template);
  if (!template) {
    throw new ApiError(500, 'errors.series.templateUnreadable', true, {
      code: 'series.templateUnreadable',
    });
  }
  return template;
}

function asJson(template: GameSeriesTemplate): Prisma.InputJsonValue {
  return template as unknown as Prisma.InputJsonValue;
}

export interface CreateSeriesFromGameInput {
  cadence: GameSeriesCadenceValue;
  name?: string | null;
  endsOn?: DayKey | null;
  seatDeadlineHours?: number;
  horizonDays?: number;
  weekday?: number;
  /** PLAYING participants of the seeding game that stay on the regular roster. */
  keepRegularUserIds?: readonly string[];
}

export interface UpdateSeriesInput {
  name?: string;
  cadence?: GameSeriesCadenceValue;
  weekday?: number;
  startTimeLocal?: string;
  durationMinutes?: number;
  endsOn?: DayKey | null;
  seatDeadlineHours?: number;
  horizonDays?: number;
  /** Allow-listed create-game fields to rewrite on future occurrences. */
  template?: Record<string, unknown>;
  scope?: GameSeriesEditScope;
  /** When scope is `future`, occurrences before this date are untouched. */
  fromDayKey?: DayKey;
}

export interface UpdateSeriesResult {
  seriesId: string;
  scope: GameSeriesEditScope;
  updatedGameIds: string[];
  /** Occurrences left alone because results already started. */
  lockedGameIds: string[];
  /** Occurrences left alone because they already began. */
  startedGameIds: string[];
  rescheduled: boolean;
}

export interface EndSeriesResult {
  seriesId: string;
  deletedGameIds: string[];
  /** Future occurrences `GameDeleteService` refused (results or children). */
  keptGameIds: string[];
}

function validateSeatDeadlineHours(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!SEAT_DEADLINE_HOUR_CHOICES.includes(value as (typeof SEAT_DEADLINE_HOUR_CHOICES)[number])) {
    throw new ApiError(400, 'errors.series.invalidSeatDeadline', true, {
      code: 'series.invalidSeatDeadline',
    });
  }
  return value;
}

function validateHorizonDays(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < MIN_HORIZON_DAYS || value > MAX_HORIZON_DAYS) {
    throw new ApiError(400, 'errors.series.invalidHorizon', true, {
      code: 'series.invalidHorizon',
    });
  }
  return value;
}

function validateEndsOn(value: DayKey | null | undefined, anchorDayKey: DayKey): Date | null {
  if (value === undefined || value === null) return null;
  if (!isDayKey(value)) {
    throw new ApiError(400, 'errors.series.invalidEndsOn', true, { code: 'series.invalidEndsOn' });
  }
  if (value < anchorDayKey) {
    throw new ApiError(400, 'errors.series.endsOnBeforeStart', true, {
      code: 'series.endsOnBeforeStart',
    });
  }
  return dayKeyToPrismaDate(value);
}

function validateWeekday(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    throw new ApiError(400, 'errors.series.invalidWeekday', true, {
      code: 'series.invalidWeekday',
    });
  }
  return value;
}

function validateCadence(value: string | undefined, fallback: GameSeriesCadence): GameSeriesCadence {
  if (value === undefined) return fallback;
  if (value !== 'WEEKLY' && value !== 'BIWEEKLY') {
    throw new ApiError(400, 'errors.series.invalidCadence', true, {
      code: 'series.invalidCadence',
    });
  }
  return value as GameSeriesCadence;
}

export class GameSeriesService {
  static async countActiveSeries(userId: string): Promise<number> {
    return prisma.gameSeries.count({
      where: { ownerId: userId, status: GameSeriesStatus.ACTIVE },
    });
  }

  static async assertUnderOwnerCap(userId: string): Promise<void> {
    const active = await GameSeriesService.countActiveSeries(userId);
    if (active >= MAX_ACTIVE_SERIES_PER_USER) {
      throw new ApiError(409, 'errors.series.ownerCapReached', true, {
        code: 'series.ownerCapReached',
        limit: MAX_ACTIVE_SERIES_PER_USER,
      });
    }
  }

  /**
   * Convert an existing one-off game into a series (`POST /games/:id/series`).
   * The seeding game becomes occurrence #1 — it is never recreated — and its
   * current PLAYING roster seeds the regulars.
   */
  static async createSeriesFromGame(
    gameId: string,
    userId: string,
    input: CreateSeriesFromGameInput,
  ): Promise<{ seriesId: string }> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        seriesId: true,
        entityType: true,
        sport: true,
        gameType: true,
        name: true,
        description: true,
        clubId: true,
        courtId: true,
        cityId: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
        maxParticipants: true,
        minParticipants: true,
        playersPerMatch: true,
        minLevel: true,
        maxLevel: true,
        isPublic: true,
        affectsRating: true,
        anyoneCanInvite: true,
        resultsByAnyone: true,
        allowDirectJoin: true,
        afterGameGoToBar: true,
        hasFixedTeams: true,
        allowUserInMultipleTeams: true,
        genderTeams: true,
        fixedNumberOfSets: true,
        maxTotalPointsPerSet: true,
        matchTimedCapMinutes: true,
        matchTimerEnabled: true,
        maxPointsPerTeam: true,
        winnerOfGame: true,
        winnerOfMatch: true,
        matchGenerationType: true,
        pointsPerWin: true,
        pointsPerLoose: true,
        pointsPerTie: true,
        ballsInGames: true,
        scoringPreset: true,
        scoringMode: true,
        deucesBeforeGoldenPoint: true,
        priceType: true,
        priceTotal: true,
        priceCurrency: true,
        resultsStatus: true,
        gameCourts: { select: { courtId: true }, orderBy: { order: 'asc' } },
        participants: {
          select: { userId: true, status: true, role: true },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'errors.games.notFound', true, { code: 'games.notFound' });
    }
    if (game.seriesId) {
      throw new ApiError(409, 'errors.series.alreadyInSeries', true, {
        code: 'series.alreadyInSeries',
      });
    }
    if (!SERIES_ELIGIBLE_ENTITY_TYPES.includes(game.entityType)) {
      throw new ApiError(400, 'errors.series.entityTypeNotEligible', true, {
        code: 'series.entityTypeNotEligible',
      });
    }
    if (game.resultsStatus !== 'NONE') {
      throw new ApiError(400, 'errors.series.gameResultsLocked', true, {
        code: 'series.gameResultsLocked',
      });
    }
    if (game.timeIsSet === false) {
      throw new ApiError(400, 'errors.series.gameTimeNotSet', true, {
        code: 'series.gameTimeNotSet',
      });
    }

    await GameSeriesService.assertUnderOwnerCap(userId);

    const timezone = await getUserTimezoneFromCityId(game.cityId);
    const seedDayKey = dayKeyInTimezone(game.startTime, timezone);
    const startTimeLocal = localTimeInTimezone(game.startTime, timezone);
    const durationMinutes = Math.max(
      15,
      Math.round((game.endTime.getTime() - game.startTime.getTime()) / 60_000),
    );

    const cadence = validateCadence(input.cadence, GameSeriesCadence.WEEKLY);
    const weekday = validateWeekday(input.weekday, isoWeekdayOfDayKey(seedDayKey));
    // The seeding game stays on its own date and is stamped as occurrence #1
    // below, so when the organizer picks a different weekday the cadence grid
    // must start on the next such weekday *after* the seed. Aligning inside the
    // seed's own week would generate a second occurrence in that same week.
    const anchorDayKey =
      weekday === isoWeekdayOfDayKey(seedDayKey)
        ? seedDayKey
        : nextWeekdayAfterDayKey(seedDayKey, weekday);
    const endsOn = validateEndsOn(input.endsOn ?? null, anchorDayKey);
    const seatDeadlineHours = validateSeatDeadlineHours(input.seatDeadlineHours, 48);
    const horizonDays = validateHorizonDays(input.horizonDays, DEFAULT_HORIZON_DAYS);

    const courtIds =
      game.gameCourts.length > 0
        ? game.gameCourts.map((gc) => gc.courtId)
        : game.courtId
          ? [game.courtId]
          : [];

    const playingUserIds = game.participants
      .filter((participant) => participant.status === 'PLAYING')
      .map((participant) => participant.userId);
    const keepSet = input.keepRegularUserIds
      ? new Set(input.keepRegularUserIds)
      : new Set(playingUserIds);
    const regularUserIds = Array.from(
      new Set(playingUserIds.filter((id) => keepSet.has(id))),
    );

    const template = buildGameSeriesTemplate(
      { ...game, cityId: game.cityId },
      anchorDayKey,
    );

    const seriesName =
      (input.name ?? '').trim() ||
      (game.name ?? '').trim() ||
      '';

    const created = await prisma.$transaction(async (tx) => {
      const series = await tx.gameSeries.create({
        data: {
          ownerId: userId,
          name: seriesName,
          entityType: game.entityType,
          cadence,
          weekday,
          startTimeLocal,
          durationMinutes,
          clubId: game.clubId,
          courtIds,
          template: asJson(template),
          horizonDays,
          seatDeadlineHours,
          endsOn,
          status: GameSeriesStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (regularUserIds.length > 0) {
        await tx.gameSeriesRegular.createMany({
          data: regularUserIds.map((regularUserId) => ({
            seriesId: series.id,
            userId: regularUserId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.game.update({
        where: { id: game.id },
        data: {
          seriesId: series.id,
          seriesOccurrenceDate: dayKeyToPrismaDate(seedDayKey),
        },
      });

      return series;
    });

    invalidateSeriesDetailCache(created.id);
    await GameSeriesGenerationService.generateForSeries(created.id);
    return { seriesId: created.id };
  }

  static async listMySeries(userId: string): Promise<
    {
      id: string;
      name: string;
      cadence: GameSeriesCadence;
      weekday: number;
      startTimeLocal: string;
      status: GameSeriesStatus;
      endsOn: DayKey | null;
      regularCount: number;
      nextOccurrenceAt: string | null;
    }[]
  > {
    const rows = await prisma.gameSeries.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        cadence: true,
        weekday: true,
        startTimeLocal: true,
        status: true,
        endsOn: true,
        _count: { select: { regulars: true } },
        occurrences: {
          where: { startTime: { gte: new Date() } },
          select: { startTime: true },
          orderBy: { startTime: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      cadence: row.cadence,
      weekday: row.weekday,
      startTimeLocal: row.startTimeLocal,
      status: row.status,
      endsOn: row.endsOn ? prismaDateToDayKey(row.endsOn) : null,
      regularCount: row._count.regulars,
      nextOccurrenceAt: row.occurrences[0]?.startTime.toISOString() ?? null,
    }));
  }

  /**
   * The series page payload. Series-private: it names every regular, lists the
   * occurrence cards (private games included) and exposes the group-channel
   * id, so the viewer must belong to the series. The public face of a series
   * is the card pill (`gameSeriesCardEnricher`), which stays open to everyone.
   *
   * The authorization runs **before the cache read** so a revoked membership
   * cannot keep serving a warm entry.
   */
  static async getSeriesDetail(
    seriesId: string,
    viewerId: string,
    options: { skipCache?: boolean; isAdmin?: boolean } = {},
  ): Promise<SeriesDetail> {
    const series = await loadSeriesOrThrow(seriesId);
    const isAdmin = options.isAdmin ?? false;
    const insider = await viewerIsSeriesInsider(seriesId, series.ownerId, viewerId, isAdmin);
    if (!insider) {
      throw new ApiError(403, 'errors.series.notAMember', true, { code: 'series.notAMember' });
    }

    const key = detailCacheKey(seriesId, viewerId);
    if (!options.skipCache) {
      const cached = seriesDetailCache.get(key);
      if (cached) return cached;
    }

    const template = templateOrThrow(series);
    const timezone = await seriesTimezone(series);
    const now = new Date();

    const [owner, occurrences, regularRows, skipRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: series.ownerId },
        select: USER_SELECT_WITH_SPORT_PROFILES,
      }),
      // Lean rows drive every derived number below. The card payloads are a
      // second, separate query: the Find-card `select` filters `participants`
      // down to the viewer plus a few roles, so it is the wrong source for
      // attendance and win-rate maths.
      prisma.game.findMany({
        where: { seriesId },
        select: {
          id: true,
          startTime: true,
          seriesOccurrenceDate: true,
          resultsStatus: true,
          status: true,
          participants: { select: { userId: true, status: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.gameSeriesRegular.findMany({
        where: { seriesId, removedAt: null },
        select: {
          userId: true,
          addedAt: true,
          user: { select: USER_SELECT_WITH_SPORT_PROFILES },
        },
        orderBy: { addedAt: 'asc' },
      }),
      prisma.gameSeriesSkip.findMany({
        where: { seriesId },
        select: { occurrenceDate: true },
        orderBy: { occurrenceDate: 'asc' },
      }),
    ]);

    const sportForProjection = template.sport as Sport;
    const photoViewer = { id: viewerId, isAdmin: false };
    const occurrenceIds = occurrences.map((occurrence) => occurrence.id);

    const cardRows =
      occurrenceIds.length > 0
        ? await prisma.game.findMany({
            where: { id: { in: occurrenceIds } },
            select: getAvailableGamesCardSelect({ viewerUserId: viewerId }),
          })
        : [];
    const cardById = new Map<string, unknown>();
    for (const row of cardRows) {
      cardById.set(
        row.id,
        projectAvailableGameCardPayload(
          projectGameUsersForSportContext(row as never),
          photoViewer,
        ),
      );
    }

    const upcoming: unknown[] = [];
    const past: unknown[] = [];
    for (const occurrence of occurrences) {
      const card = cardById.get(occurrence.id);
      if (!card) continue;
      if (occurrence.startTime.getTime() > now.getTime()) upcoming.push(card);
      else past.push(card);
    }
    past.reverse();

    const outcomes =
      occurrenceIds.length > 0
        ? await prisma.gameOutcome.findMany({
            where: { gameId: { in: occurrenceIds } },
            select: { gameId: true, userId: true, isWinner: true, isWinForStreak: true },
          })
        : [];

    const pastOccurrences = occurrences.filter(
      (occurrence) => occurrence.startTime.getTime() <= now.getTime(),
    );
    const pastIdSet = new Set(pastOccurrences.map((occurrence) => occurrence.id));

    const playedByUser = new Map<string, number>();
    for (const occurrence of pastOccurrences) {
      for (const participant of occurrence.participants) {
        if (participant.status !== 'PLAYING') continue;
        playedByUser.set(participant.userId, (playedByUser.get(participant.userId) ?? 0) + 1);
      }
    }

    const ratedByUser = new Map<string, number>();
    const winsByUser = new Map<string, number>();
    for (const outcome of outcomes) {
      if (!pastIdSet.has(outcome.gameId)) continue;
      ratedByUser.set(outcome.userId, (ratedByUser.get(outcome.userId) ?? 0) + 1);
      const won = outcome.isWinForStreak ?? outcome.isWinner;
      if (won) winsByUser.set(outcome.userId, (winsByUser.get(outcome.userId) ?? 0) + 1);
    }

    const nextOccurrenceRaw = occurrences.find(
      (occurrence) => occurrence.startTime.getTime() > now.getTime(),
    );
    const nextPlayingUserIds = new Set(
      (nextOccurrenceRaw?.participants ?? [])
        .filter((participant) => participant.status === 'PLAYING')
        .map((participant) => participant.userId),
    );

    const pastCount = pastOccurrences.length;
    const regulars: SeriesRegularSummary[] = regularRows.map((row) => {
      const gamesPlayed = playedByUser.get(row.userId) ?? 0;
      const rated = ratedByUser.get(row.userId) ?? 0;
      const wins = winsByUser.get(row.userId) ?? 0;
      return {
        user: row.user ? projectUserForSportContext(row.user, sportForProjection) : null,
        addedAt: row.addedAt.toISOString(),
        gamesPlayed,
        wins,
        winRate: rated > 0 ? Math.round((wins / rated) * 100) : null,
        attendanceRate: pastCount > 0 ? Math.round((gamesPlayed / pastCount) * 100) : null,
        confirmedForNext: nextPlayingUserIds.has(row.userId),
      };
    });

    const viewerRated = ratedByUser.get(viewerId) ?? 0;
    const viewerWins = winsByUser.get(viewerId) ?? 0;
    const viewerGames = playedByUser.get(viewerId) ?? 0;

    let streakWeeks = 0;
    for (let index = pastOccurrences.length - 1; index >= 0; index -= 1) {
      const played = pastOccurrences[index].participants.some(
        (participant) => participant.userId === viewerId && participant.status === 'PLAYING',
      );
      if (!played) break;
      streakWeeks += 1;
    }

    const todayDayKey = dayKeyInTimezone(now, timezone);
    const skips: SeriesSkipSummary[] = skipRows.map((row) => {
      const dayKey = prismaDateToDayKey(row.occurrenceDate);
      return { occurrenceDate: dayKey, undoable: dayKey >= todayDayKey };
    });

    const existingDayKeys = new Set(
      occurrences
        .map((occurrence) =>
          occurrence.seriesOccurrenceDate
            ? prismaDateToDayKey(occurrence.seriesOccurrenceDate)
            : null,
        )
        .filter((value): value is DayKey => value !== null),
    );
    const plannedDayKeys =
      series.status === GameSeriesStatus.ACTIVE
        ? listOccurrenceDayKeys({
            anchorDayKey: template.anchorDayKey,
            cadence: series.cadence as GameSeriesCadenceValue,
            fromDayKey: todayDayKey,
            throughDayKey: horizonThroughDayKey(todayDayKey, series.horizonDays),
            endsOnDayKey: series.endsOn ? prismaDateToDayKey(series.endsOn) : null,
            skipDayKeys: skips.map((skip) => skip.occurrenceDate),
          }).filter((dayKey) => !existingDayKeys.has(dayKey))
        : [];

    const regularUserIds = new Set(regularRows.map((row) => row.userId));
    const confirmedCount = Array.from(nextPlayingUserIds).filter((id) =>
      regularUserIds.has(id),
    ).length;

    const detail: SeriesDetail = {
      series: {
        id: series.id,
        name: series.name,
        entityType: series.entityType,
        cadence: series.cadence,
        weekday: series.weekday,
        startTimeLocal: series.startTimeLocal,
        durationMinutes: series.durationMinutes,
        horizonDays: series.horizonDays,
        seatDeadlineHours: series.seatDeadlineHours,
        endsOn: series.endsOn ? prismaDateToDayKey(series.endsOn) : null,
        status: series.status,
        // Chat membership is owner + active regulars (`syncSeriesChatMembers`).
        // A participant of one occurrence is an insider for the roster and the
        // history, but not a member of the group channel — do not hand them
        // its id.
        groupChannelId:
          isSeriesManager({ seriesOwnerId: series.ownerId, actorId: viewerId, isAdmin }) ||
          regularUserIds.has(viewerId)
            ? series.groupChannelId
            : null,
        clubId: series.clubId,
        courtIds: series.courtIds,
        timezone,
        createdAt: series.createdAt.toISOString(),
        endedAt:
          series.status === GameSeriesStatus.ENDED ? series.updatedAt.toISOString() : null,
        owner: owner ? projectUserForSportContext(owner, sportForProjection) : null,
        isOwner: series.ownerId === viewerId,
        occurrenceCount: occurrences.length,
      },
      upcoming,
      past,
      plannedDayKeys,
      skips,
      regulars,
      stats: {
        games: viewerGames,
        winRate: viewerRated > 0 ? Math.round((viewerWins / viewerRated) * 100) : null,
        streakWeeks,
      },
      nextOccurrence: nextOccurrenceRaw
        ? {
            gameId: nextOccurrenceRaw.id,
            startTime: nextOccurrenceRaw.startTime.toISOString(),
            occurrenceDate: nextOccurrenceRaw.seriesOccurrenceDate
              ? prismaDateToDayKey(nextOccurrenceRaw.seriesOccurrenceDate)
              : dayKeyInTimezone(nextOccurrenceRaw.startTime, timezone),
            seatDeadlineAt: seatDeadlineFor(
              nextOccurrenceRaw.startTime,
              series.seatDeadlineHours,
            ).toISOString(),
            confirmedCount,
            regularCount: regularRows.length,
            viewerIsPlaying: nextPlayingUserIds.has(viewerId),
          }
        : null,
    };

    seriesDetailCache.set(key, detail);
    return detail;
  }

  static async updateSeries(
    seriesId: string,
    userId: string,
    input: UpdateSeriesInput,
    isAdmin = false,
  ): Promise<UpdateSeriesResult> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, userId, isAdmin);
    if (series.status !== GameSeriesStatus.ACTIVE) {
      throw new ApiError(409, 'errors.series.ended', true, { code: 'series.ended' });
    }

    const template = templateOrThrow(series);
    const timezone = await seriesTimezone(series);
    const now = new Date();
    const todayDayKey = dayKeyInTimezone(now, timezone);
    const scope: GameSeriesEditScope = input.scope ?? 'future';

    const cadence = validateCadence(input.cadence, series.cadence);
    const weekday = validateWeekday(input.weekday, series.weekday);
    const seatDeadlineHours = validateSeatDeadlineHours(
      input.seatDeadlineHours,
      series.seatDeadlineHours,
    );
    const horizonDays = validateHorizonDays(input.horizonDays, series.horizonDays);

    if (input.startTimeLocal !== undefined && !isLocalTimeString(input.startTimeLocal)) {
      throw new ApiError(400, 'errors.series.invalidStartTime', true, {
        code: 'series.invalidStartTime',
      });
    }
    const startTimeLocal = input.startTimeLocal ?? series.startTimeLocal;

    if (
      input.durationMinutes !== undefined &&
      (!Number.isInteger(input.durationMinutes) ||
        input.durationMinutes < 15 ||
        input.durationMinutes > 24 * 60)
    ) {
      throw new ApiError(400, 'errors.series.invalidDuration', true, {
        code: 'series.invalidDuration',
      });
    }
    const durationMinutes = input.durationMinutes ?? series.durationMinutes;

    let anchorDayKey = template.anchorDayKey;
    if (weekday !== series.weekday) {
      anchorDayKey = alignDayKeyToWeekday(anchorDayKey, weekday);
    }
    // Keep the phase meaningful: an anchor far in the past is fine, but it must
    // still land on the chosen weekday.
    if (isoWeekdayOfDayKey(anchorDayKey) !== weekday) {
      anchorDayKey = alignDayKeyToWeekday(anchorDayKey, weekday);
    }

    const endsOn =
      input.endsOn === undefined
        ? series.endsOn
        : validateEndsOn(input.endsOn, anchorDayKey);

    const nextTemplate = input.template
      ? mergeGameSeriesTemplate(withAnchorDayKey(template, anchorDayKey), input.template)
      : withAnchorDayKey(template, anchorDayKey);

    const scheduleChanged =
      cadence !== series.cadence ||
      weekday !== series.weekday ||
      startTimeLocal !== series.startTimeLocal ||
      durationMinutes !== series.durationMinutes;

    await prisma.gameSeries.update({
      where: { id: seriesId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        cadence,
        weekday,
        startTimeLocal,
        durationMinutes,
        seatDeadlineHours,
        horizonDays,
        endsOn,
        template: asJson(nextTemplate),
      },
    });

    const result: UpdateSeriesResult = {
      seriesId,
      scope,
      updatedGameIds: [],
      lockedGameIds: [],
      startedGameIds: [],
      rescheduled: scheduleChanged,
    };

    if (scope === 'future') {
      const fromDayKey = input.fromDayKey && isDayKey(input.fromDayKey)
        ? input.fromDayKey
        : todayDayKey;

      const rows = await prisma.game.findMany({
        where: { seriesId },
        select: {
          id: true,
          startTime: true,
          resultsStatus: true,
          status: true,
          seriesOccurrenceDate: true,
        },
        orderBy: { startTime: 'asc' },
      });

      const occurrences: OccurrenceForScope[] = rows.map((row) => ({
        id: row.id,
        occurrenceDayKey: row.seriesOccurrenceDate
          ? prismaDateToDayKey(row.seriesOccurrenceDate)
          : dayKeyInTimezone(row.startTime, timezone),
        startTime: row.startTime,
        resultsStatus: row.resultsStatus,
        status: row.status,
      }));

      const { applicable, locked, started } = partitionOccurrencesForFutureEdit({
        occurrences,
        fromDayKey,
        now,
      });
      result.lockedGameIds = locked.map((row) => row.id);
      result.startedGameIds = started.map((row) => row.id);

      for (const occurrence of applicable) {
        const patch: Record<string, unknown> = buildOccurrencePatch(nextTemplate);
        if (scheduleChanged) {
          const nextDayKey = nextOccurrenceOnOrAfter(
            anchorDayKey,
            cadence as GameSeriesCadenceValue,
            occurrence.occurrenceDayKey,
          );
          const startTime = occurrenceStartUtc(nextDayKey, startTimeLocal, timezone);
          patch.startTime = startTime.toISOString();
          patch.endTime = occurrenceEndUtc(startTime, durationMinutes).toISOString();
          patch.timeIsSet = true;
        }

        try {
          await GameUpdateService.updateGame(occurrence.id, patch, series.ownerId, false);
          if (scheduleChanged) {
            const nextDayKey = nextOccurrenceOnOrAfter(
              anchorDayKey,
              cadence as GameSeriesCadenceValue,
              occurrence.occurrenceDayKey,
            );
            await prisma.game
              .update({
                where: { id: occurrence.id },
                data: { seriesOccurrenceDate: dayKeyToPrismaDate(nextDayKey) },
              })
              .catch(() => undefined);
          }
          result.updatedGameIds.push(occurrence.id);
        } catch (error) {
          result.lockedGameIds.push(occurrence.id);
          console.error('[GameSeriesService] occurrence template re-apply failed', {
            seriesId,
            gameId: occurrence.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    invalidateSeriesDetailCache(seriesId);
    await GameSeriesGenerationService.generateForSeries(seriesId);
    return result;
  }

  static async endSeries(
    seriesId: string,
    userId: string,
    isAdmin = false,
  ): Promise<EndSeriesResult> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, userId, isAdmin);

    const now = new Date();
    const rows = await prisma.game.findMany({
      where: { seriesId, startTime: { gt: now } },
      select: {
        id: true,
        startTime: true,
        resultsStatus: true,
        status: true,
        seriesOccurrenceDate: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const timezone = await seriesTimezone(series);
    const occurrences: OccurrenceForScope[] = rows.map((row) => ({
      id: row.id,
      occurrenceDayKey: row.seriesOccurrenceDate
        ? prismaDateToDayKey(row.seriesOccurrenceDate)
        : dayKeyInTimezone(row.startTime, timezone),
      startTime: row.startTime,
      resultsStatus: row.resultsStatus,
      status: row.status,
    }));

    const { deletable, kept } = selectDeletableOccurrences(occurrences, now);
    const result: EndSeriesResult = {
      seriesId,
      deletedGameIds: [],
      keptGameIds: kept.map((row) => row.id),
    };

    for (const occurrence of deletable) {
      try {
        await GameDeleteService.deleteGame(occurrence.id, series.ownerId);
        result.deletedGameIds.push(occurrence.id);
      } catch (error) {
        // GameDeleteService already refuses games with results or children —
        // that refusal is the answer, not an error to force past.
        result.keptGameIds.push(occurrence.id);
        console.warn('[GameSeriesService] occurrence kept on end-series', {
          seriesId,
          gameId: occurrence.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await prisma.gameSeries.update({
      where: { id: seriesId },
      data: { status: GameSeriesStatus.ENDED },
    });
    invalidateSeriesDetailCache(seriesId);
    return result;
  }

  static async skipOccurrence(
    seriesId: string,
    userId: string,
    occurrenceDayKey: DayKey,
    isAdmin = false,
  ): Promise<{ occurrenceDate: DayKey; deletedGameId: string | null }> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, userId, isAdmin);
    if (!isDayKey(occurrenceDayKey)) {
      throw new ApiError(400, 'errors.series.invalidOccurrenceDate', true, {
        code: 'series.invalidOccurrenceDate',
      });
    }

    const timezone = await seriesTimezone(series);
    const now = new Date();
    if (occurrenceDayKey < dayKeyInTimezone(now, timezone)) {
      throw new ApiError(400, 'errors.series.cannotSkipPast', true, {
        code: 'series.cannotSkipPast',
      });
    }

    await prisma.gameSeriesSkip.upsert({
      where: {
        seriesId_occurrenceDate: {
          seriesId,
          occurrenceDate: dayKeyToPrismaDate(occurrenceDayKey),
        },
      },
      create: { seriesId, occurrenceDate: dayKeyToPrismaDate(occurrenceDayKey) },
      update: {},
    });

    const existing = await prisma.game.findFirst({
      where: {
        seriesId,
        seriesOccurrenceDate: dayKeyToPrismaDate(occurrenceDayKey),
      },
      select: { id: true, resultsStatus: true, startTime: true },
    });

    let deletedGameId: string | null = null;
    if (existing && existing.resultsStatus === 'NONE' && existing.startTime > now) {
      try {
        await GameDeleteService.deleteGame(existing.id, series.ownerId);
        deletedGameId = existing.id;
      } catch (error) {
        console.warn('[GameSeriesService] skipped occurrence could not be deleted', {
          seriesId,
          gameId: existing.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    invalidateSeriesDetailCache(seriesId);
    return { occurrenceDate: occurrenceDayKey, deletedGameId };
  }

  static async undoSkip(
    seriesId: string,
    userId: string,
    occurrenceDayKey: DayKey,
    isAdmin = false,
  ): Promise<{ occurrenceDate: DayKey }> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, userId, isAdmin);
    if (!isDayKey(occurrenceDayKey)) {
      throw new ApiError(400, 'errors.series.invalidOccurrenceDate', true, {
        code: 'series.invalidOccurrenceDate',
      });
    }

    await prisma.gameSeriesSkip.deleteMany({
      where: { seriesId, occurrenceDate: dayKeyToPrismaDate(occurrenceDayKey) },
    });

    invalidateSeriesDetailCache(seriesId);
    await GameSeriesGenerationService.generateForSeries(seriesId);
    return { occurrenceDate: occurrenceDayKey };
  }

  /**
   * Put a user on the regular roster. **Owner or admin only, for every caller
   * including a self-add** — being a regular is what unlocks the carry-over
   * seat on the next occurrence and membership of the private series chat, so
   * a self-service path here would let any authenticated account walk into a
   * private, level-gated game. Nothing in PRD 345 sanctions self-add; user
   * story 18 is about self-*removal*, which `removeRegular` allows.
   */
  static async addRegular(
    seriesId: string,
    actorId: string,
    targetUserId: string,
    isAdmin = false,
  ): Promise<void> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, actorId, isAdmin);

    await prisma.gameSeriesRegular.upsert({
      where: { seriesId_userId: { seriesId, userId: targetUserId } },
      create: { seriesId, userId: targetUserId },
      update: { removedAt: null },
    });
    invalidateSeriesDetailCache(seriesId);
  }

  /**
   * Leave (or be removed from) the regular roster. Deliberately does **not**
   * touch the current occurrence's roster: "not next week" and "not tonight"
   * are separate choices (PRD 345, user story 18).
   *
   * This is the **only** self-referential authorization shortcut on the series
   * surface, and it is safe in exactly one direction: leaving a roster removes
   * privileges, it never grants any.
   */
  static async removeRegular(
    seriesId: string,
    actorId: string,
    targetUserId: string,
    isAdmin = false,
  ): Promise<void> {
    const series = await loadSeriesOrThrow(seriesId);
    if (!canRemoveSeriesRegular({ seriesOwnerId: series.ownerId, actorId, isAdmin, targetUserId })) {
      throw new ApiError(403, 'errors.series.notOwner', true, { code: 'series.notOwner' });
    }

    await prisma.gameSeriesRegular.updateMany({
      where: { seriesId, userId: targetUserId, removedAt: null },
      data: { removedAt: new Date() },
    });
    invalidateSeriesDetailCache(seriesId);
  }

  /**
   * Lazily create the optional series group chat (owner only, first tap).
   *
   * The ownership check runs **before every side effect and before any id
   * leaves this method** — including the already-created branch. An early
   * return that syncs members and hands back `groupChannelId` ahead of the
   * check turns the check into a first-call-only formality and leaks a private
   * channel id to anyone who can name a series.
   */
  static async ensureSeriesChat(
    seriesId: string,
    userId: string,
    isAdmin = false,
  ): Promise<{ groupChannelId: string }> {
    const series = await loadSeriesOrThrow(seriesId);
    await assertSeriesOwner(series, userId, isAdmin);

    if (series.groupChannelId) {
      await GameSeriesService.syncSeriesChatMembers(seriesId, series.groupChannelId);
      return { groupChannelId: series.groupChannelId };
    }

    const regulars = await prisma.gameSeriesRegular.findMany({
      where: { seriesId, removedAt: null },
      select: { userId: true },
    });
    const memberIds = Array.from(
      new Set([series.ownerId, ...regulars.map((regular) => regular.userId)]),
    );

    const channelId = await prisma.$transaction(async (tx) => {
      const channel = await tx.groupChannel.create({
        data: {
          name: series.name,
          isChannel: false,
          isPublic: false,
          participantsCount: memberIds.length,
        },
        select: { id: true },
      });

      await tx.groupChannelParticipant.createMany({
        data: memberIds.map((memberId) => ({
          groupChannelId: channel.id,
          userId: memberId,
          role: memberId === series.ownerId ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
        })),
        skipDuplicates: true,
      });

      await tx.gameSeries.update({
        where: { id: seriesId },
        data: { groupChannelId: channel.id },
      });

      return channel.id;
    });

    invalidateSeriesDetailCache(seriesId);
    return { groupChannelId: channelId };
  }

  /** Keep the series chat membership aligned with the regular roster. */
  static async syncSeriesChatMembers(seriesId: string, groupChannelId: string): Promise<void> {
    const [series, regulars, existing] = await Promise.all([
      prisma.gameSeries.findUnique({ where: { id: seriesId }, select: { ownerId: true } }),
      prisma.gameSeriesRegular.findMany({
        where: { seriesId, removedAt: null },
        select: { userId: true },
      }),
      prisma.groupChannelParticipant.findMany({
        where: { groupChannelId },
        select: { userId: true },
      }),
    ]);
    if (!series) return;

    const existingIds = new Set(existing.map((row) => row.userId));
    const wanted = new Set([series.ownerId, ...regulars.map((regular) => regular.userId)]);
    const missing = Array.from(wanted).filter((id) => !existingIds.has(id));
    if (missing.length === 0) return;

    await prisma.groupChannelParticipant.createMany({
      data: missing.map((userId) => ({
        groupChannelId,
        userId,
        role: userId === series.ownerId ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
      })),
      skipDuplicates: true,
    });
    await prisma.groupChannel.update({
      where: { id: groupChannelId },
      data: { participantsCount: existingIds.size + missing.length },
    });
  }
}

/**
 * The subset of a template that may be pushed onto an existing occurrence.
 * Identity fields (`sport`, `entityType`) and anything the game owns per
 * occurrence (its roster, its booking) are deliberately absent.
 */
function buildOccurrencePatch(template: GameSeriesTemplate): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const copy = <K extends keyof GameSeriesTemplate>(key: K): void => {
    const value = template[key];
    if (value !== undefined) patch[key as string] = value;
  };

  copy('name');
  copy('description');
  copy('maxParticipants');
  copy('minParticipants');
  copy('minLevel');
  copy('maxLevel');
  copy('isPublic');
  copy('affectsRating');
  copy('anyoneCanInvite');
  copy('resultsByAnyone');
  copy('allowDirectJoin');
  copy('afterGameGoToBar');
  copy('genderTeams');
  copy('priceType');
  copy('priceTotal');
  copy('priceCurrency');

  return patch;
}
