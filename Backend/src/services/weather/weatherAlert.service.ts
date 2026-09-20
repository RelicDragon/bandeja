/**
 * PRD 357 — weather alerts for outdoor games.
 *
 * **Noise control is the product.** Three invariants live here and must survive
 * every future refactor:
 *
 * 1. An indoor game, or a game whose courts cannot be determined, is never
 *    alerted and never badged (`detectOutdoor(...).known === false`).
 * 2. A game is alerted at most twice, and the second time only when the
 *    severity *class* rose — the dedupe record is `Game.weatherAlertState`,
 *    a **persisted** blob, because the scheduler's sibling reminder `Set`s are
 *    lost on every deploy.
 * 3. A forecast failure never escapes the cron callback. Everything in
 *    {@link runWeatherAlertSweep} is caught; the sweep returns counters.
 *
 * Forecast data comes from the existing `weatherForecast.service.ts` DB cache
 * (`WeatherForecastCache`), read in one batched cache-only query per pass.
 * There is deliberately no second provider path.
 */
import { EntityType, NotificationChannelType, Prisma, ResultsStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { emitGameWeatherAlertUpdated } from '../socketEmitFacade';
import { registerPushActionHandler } from '../push/pushActionHandlers';
import { registerAvailableGamesEnricher } from '../game/availableGamesEnrichment';
import type { WeatherRisk } from '../game/availableGamesEnrichmentTypes';
import {
  getCachedForecastPayloadsForCities,
  hourlyWindow,
  type WeatherForecastPayload,
  type WeatherHourlyPoint,
} from '../weatherForecast.service';
import notificationService from '../notification.service';
import telegramNotificationService from '../telegram/notification.service';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import { NotificationPreferenceService } from '../notificationPreference.service';
import {
  createGameWeatherAlertPushNotification,
  type WeatherAlertRecipientRole,
} from '../push/notifications/game-weather-alert-push.notification';
import {
  canDispatchBroadcast,
  shouldSuppressAllOutboundNotifications,
} from '../../utils/notificationDispatchGuard';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType } from '../../utils/systemMessages';
import { fetchGameWithDetails } from '../../utils/gameQueries';
import { weatherT } from './weatherAlertCopy';
import {
  alertWindowBounds,
  classifyWeatherRisk,
  detectOutdoor,
  evaluateGameWeather,
  isAlertableSeverity,
  parseWeatherAlertState,
  WEATHER_RISK_CARD_HORIZON_HOURS,
  type WeatherAlertState,
  type WeatherAlertWindow,
  type WeatherRiskAssessment,
  type WeatherRiskSeverity,
} from './weatherRisk';

const HOUR_MS = 60 * 60 * 1000;

/** Entity types that can be rained off. EVENT listings are explicitly out of scope. */
const WEATHER_ALERT_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.LEAGUE,
];

/** Hard ceiling on games evaluated in one pass, so a bad day cannot stall the cron. */
const WEATHER_ALERT_MAX_GAMES_PER_PASS = 300;
/** Hard ceiling on cards enriched in one Find page. */
const WEATHER_RISK_MAX_ENRICH_GAMES = 100;

type CourtRow = {
  id: string;
  name: string;
  isIndoor: boolean;
  clubId: string;
};

type AlertGameRow = {
  id: string;
  name: string | null;
  entityType: EntityType;
  cityId: string;
  clubId: string | null;
  startTime: Date;
  endTime: Date;
  weatherAlertState: unknown;
  club: { id: string; name: string } | null;
  court: (CourtRow & { club: { id: string; name: string } | null }) | null;
  gameCourts: { court: CourtRow & { club: { id: string; name: string } | null } }[];
};

const ALERT_GAME_SELECT = {
  id: true,
  name: true,
  entityType: true,
  cityId: true,
  clubId: true,
  startTime: true,
  endTime: true,
  weatherAlertState: true,
  club: { select: { id: true, name: true } },
  court: {
    select: {
      id: true,
      name: true,
      isIndoor: true,
      clubId: true,
      club: { select: { id: true, name: true } },
    },
  },
  gameCourts: {
    orderBy: { order: 'asc' as const },
    select: {
      court: {
        select: {
          id: true,
          name: true,
          isIndoor: true,
          clubId: true,
          club: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

/** The courts a game is actually played on, primary court included. */
function gameCourtsOf(game: AlertGameRow): (CourtRow & { club: { id: string; name: string } | null })[] {
  if (game.gameCourts.length > 0) return game.gameCourts.map((link) => link.court);
  return game.court ? [game.court] : [];
}

function resolveClubId(game: AlertGameRow): string | null {
  return game.clubId ?? game.court?.clubId ?? gameCourtsOf(game)[0]?.clubId ?? null;
}

function clubNameOf(game: AlertGameRow): string | null {
  return game.club?.name ?? game.court?.club?.name ?? gameCourtsOf(game)[0]?.club?.name ?? null;
}

/** "Padel Centar · Court 3 (outdoor)" — assembled once, localized per recipient. */
function describePlace(game: AlertGameRow, language: string): string {
  const parts: string[] = [];
  const club = clubNameOf(game);
  if (club) parts.push(club);
  const outdoorCourts = gameCourtsOf(game).filter((court) => court.isIndoor === false);
  if (outdoorCourts.length > 0) {
    const names = outdoorCourts.map((court) => court.name).join(', ');
    parts.push(`${names} (${weatherT('weather.outdoorCourt', language)})`);
  }
  return parts.join(' · ');
}

function hoursForGame(
  payload: WeatherForecastPayload | undefined,
  startTime: Date,
  endTime: Date,
): WeatherHourlyPoint[] {
  if (!payload) return [];
  return hourlyWindow(payload, startTime, endTime);
}

// ---------------------------------------------------------------------------
// Outdoor resolution with the club-majority fallback
// ---------------------------------------------------------------------------

type ClubCourtIndex = Map<string, { isIndoor: boolean }[]>;

async function loadClubActiveCourts(clubIds: string[]): Promise<ClubCourtIndex> {
  const index: ClubCourtIndex = new Map();
  const unique = [...new Set(clubIds.filter(Boolean))];
  if (unique.length === 0) return index;

  const rows = await prisma.court.findMany({
    where: { clubId: { in: unique }, isActive: true },
    select: { clubId: true, isIndoor: true },
  });
  for (const row of rows) {
    const bucket = index.get(row.clubId);
    if (bucket) bucket.push({ isIndoor: row.isIndoor });
    else index.set(row.clubId, [{ isIndoor: row.isIndoor }]);
  }
  return index;
}

function outdoorFor(game: AlertGameRow, clubCourts: ClubCourtIndex) {
  const clubId = resolveClubId(game);
  return detectOutdoor({
    gameCourts: game.gameCourts.map((link) => ({ isIndoor: link.court.isIndoor })),
    primaryCourt: game.court ? { isIndoor: game.court.isIndoor } : null,
    clubActiveCourts: clubId ? clubCourts.get(clubId) ?? [] : [],
  });
}

// ---------------------------------------------------------------------------
// The scheduler step
// ---------------------------------------------------------------------------

export interface WeatherAlertSweepResult {
  evaluated: number;
  alerted: number;
  skippedIndoorOrUnknown: number;
  skippedNoForecast: number;
  failed: number;
}

const EMPTY_SWEEP: WeatherAlertSweepResult = {
  evaluated: 0,
  alerted: 0,
  skippedIndoorOrUnknown: 0,
  skippedNoForecast: 0,
  failed: 0,
};

async function loadGamesForWindow(
  window: WeatherAlertWindow,
  now: Date,
): Promise<AlertGameRow[]> {
  const { from, to } = alertWindowBounds(window, now);
  return prisma.game.findMany({
    where: {
      // Not `status: 'ANNOUNCED'`: `status` is clock-derived and must never gate
      // a state-changing path (`docs/product/constraints.md`). `resultsStatus`
      // is the lock; `ARCHIVED` stays the separate retention hard stop. The
      // "is it still ahead of us" part is the explicit `startTime` range below.
      resultsStatus: ResultsStatus.NONE,
      status: { not: 'ARCHIVED' },
      timeIsSet: true,
      entityType: { in: WEATHER_ALERT_ENTITY_TYPES },
      startTime: { gte: from, lte: to },
    },
    orderBy: { startTime: 'asc' },
    take: WEATHER_ALERT_MAX_GAMES_PER_PASS,
    select: ALERT_GAME_SELECT,
  });
}

/**
 * One pass of the weather check. Called from `GameStatusScheduler`'s `0,30 * * * *`
 * cron callback — the `:00/:30` cadence is exactly what the 11.5–12.5 h and
 * 1.5–2.5 h windows are sized against, so both windows are hit exactly once.
 *
 * Never throws: every failure mode is counted and logged.
 */
export async function runWeatherAlertSweep(
  now: Date = new Date(),
): Promise<WeatherAlertSweepResult> {
  const result: WeatherAlertSweepResult = { ...EMPTY_SWEEP };

  try {
    const [firstGames, secondGames] = await Promise.all([
      loadGamesForWindow('first', now),
      loadGamesForWindow('second', now),
    ]);

    const byWindow: { window: WeatherAlertWindow; games: AlertGameRow[] }[] = [
      { window: 'first', games: firstGames },
      { window: 'second', games: secondGames },
    ];
    const allGames = [...firstGames, ...secondGames];
    if (allGames.length === 0) return result;

    const [payloads, clubCourts] = await Promise.all([
      getCachedForecastPayloadsForCities(allGames.map((game) => game.cityId), now),
      loadClubActiveCourts(
        allGames
          .filter((game) => game.gameCourts.length === 0 && !game.court)
          .map((game) => resolveClubId(game))
          .filter((clubId): clubId is string => Boolean(clubId)),
      ),
    ]);

    for (const { window, games } of byWindow) {
      for (const game of games) {
        try {
          const outcome = await evaluateGame(game, window, payloads, clubCourts, now);
          result.evaluated += 1;
          if (outcome === 'alerted') result.alerted += 1;
          if (outcome === 'indoorOrUnknown') result.skippedIndoorOrUnknown += 1;
          if (outcome === 'noForecast') result.skippedNoForecast += 1;
        } catch (error) {
          result.failed += 1;
          console.error(`[WeatherAlert] Failed to evaluate game ${game.id}:`, error);
        }
      }
    }
  } catch (error) {
    result.failed += 1;
    console.error('[WeatherAlert] Weather alert sweep failed:', error);
  }

  return result;
}

type EvaluateOutcome = 'alerted' | 'quiet' | 'indoorOrUnknown' | 'noForecast';

async function evaluateGame(
  game: AlertGameRow,
  window: WeatherAlertWindow,
  payloads: Map<string, WeatherForecastPayload>,
  clubCourts: ClubCourtIndex,
  now: Date,
): Promise<EvaluateOutcome> {
  const previous = parseWeatherAlertState(game.weatherAlertState);
  const evaluation = evaluateGameWeather({
    window,
    detection: outdoorFor(game, clubCourts),
    hours: hoursForGame(payloads.get(game.cityId), game.startTime, game.endTime),
    state: previous,
    now,
  });

  if (evaluation.skip) return evaluation.skip;

  if (!evaluation.send) {
    await touchEvaluatedAt(game.id, now);
    return 'quiet';
  }

  /*
   * **Claim, then dispatch.** The old order sent the whole roster first and
   * only then wrote `sentAt[]`, so a deploy (or a failed `game.update`) between
   * the two left no marker at all — and the 11.5–12.5 h window is wider than
   * the 30-minute cadence, so the very next tick alerted everyone a second
   * time. `claimAlertSend` is a single conditional UPDATE: it only wins if the
   * row still carries the `sentAt` length this evaluation was built from and
   * still has no `keepAsPlannedAt`, so two concurrent sweeps (two nodes, or one
   * overrunning tick) can never both dispatch.
   */
  const claimed = await claimAlertSend(
    game.id,
    evaluation.nextState!,
    previous?.sentAt.length ?? 0,
  );
  if (!claimed) return 'quiet';

  await notifyGame(game, evaluation.assessment!, evaluation.escalated);
  await emitGameWeatherAlertUpdated(game.id, { severity: evaluation.assessment!.severity });
  return 'alerted';
}

function stateJson(state: WeatherAlertState): string {
  // The Json column takes a plain object; the interface is not assignable to
  // Prisma's recursive `InputJsonValue` because of its optional property.
  return JSON.stringify(state as unknown as Prisma.InputJsonObject);
}

/**
 * The quiet branch only moves `lastEvaluatedAt`, so it merges that one key in
 * place instead of rewriting the blob. A wholesale rewrite here would race the
 * organizer's "Keep as planned" tap and the sending branch's `sentAt[]` append.
 */
async function touchEvaluatedAt(gameId: string, now: Date): Promise<void> {
  const nowIso = now.toISOString();
  await prisma.$executeRaw`
    UPDATE "Game"
    SET "weatherAlertState" = CASE
      WHEN jsonb_typeof("weatherAlertState") = 'object'
        THEN "weatherAlertState" || jsonb_build_object('lastEvaluatedAt', ${nowIso}::text)
      ELSE jsonb_build_object(
        'severity', 'none'::text,
        'sentAt', '[]'::jsonb,
        'lastEvaluatedAt', ${nowIso}::text
      )
    END
    WHERE "id" = ${gameId}
  `;
}

/**
 * Atomically reserve the right to send this alert.
 *
 * Returns `false` when another pass already appended to `sentAt[]` for this
 * game, or when the organizer chose "Keep as planned" between the read and the
 * write. Any `keepAsPlannedAt` already on the row is carried over rather than
 * overwritten — `weatherAlertState` is one JSON blob shared with
 * {@link keepAsPlanned}, so a plain rewrite is a lost update.
 */
async function claimAlertSend(
  gameId: string,
  state: WeatherAlertState,
  previousSentCount: number,
): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "Game"
    SET "weatherAlertState" =
      ${stateJson(state)}::jsonb
      || jsonb_strip_nulls(
           jsonb_build_object('keepAsPlannedAt', "weatherAlertState" -> 'keepAsPlannedAt')
         )
    WHERE "id" = ${gameId}
      AND (CASE
        WHEN jsonb_typeof("weatherAlertState" -> 'sentAt') = 'array'
          THEN jsonb_array_length("weatherAlertState" -> 'sentAt')
        ELSE 0
      END) = ${previousSentCount}
      AND NOT (COALESCE("weatherAlertState", '{}'::jsonb) ? 'keepAsPlannedAt')
  `;
  return updated > 0;
}

/**
 * Records "Keep as planned" without touching anything the sweep owns.
 *
 * Merge, never rewrite: the sweep appends to `sentAt[]` and moves `severity` on
 * the same blob, and a wholesale write from either side silently erases the
 * other. Idempotent — an existing `keepAsPlannedAt` is kept.
 */
async function mergeKeepAsPlanned(gameId: string, now: Date): Promise<void> {
  const nowIso = now.toISOString();
  await prisma.$executeRaw`
    UPDATE "Game"
    SET "weatherAlertState" = CASE
      WHEN jsonb_typeof("weatherAlertState") = 'object'
        THEN "weatherAlertState" || jsonb_build_object(
          'keepAsPlannedAt',
          COALESCE("weatherAlertState" ->> 'keepAsPlannedAt', ${nowIso}::text),
          'lastEvaluatedAt', ${nowIso}::text
        )
      ELSE jsonb_build_object(
        'severity', 'none'::text,
        'sentAt', '[]'::jsonb,
        'keepAsPlannedAt', ${nowIso}::text,
        'lastEvaluatedAt', ${nowIso}::text
      )
    END
    WHERE "id" = ${gameId}
  `;
}

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

type Recipient = {
  id: string;
  language: string | null;
  currentCityId: string | null;
  telegramId: string | null;
  role: WeatherAlertRecipientRole;
};

async function loadRecipients(gameId: string): Promise<Recipient[]> {
  const rows = await prisma.gameParticipant.findMany({
    where: { gameId, status: { in: ['PLAYING', 'NON_PLAYING'] } },
    select: {
      role: true,
      status: true,
      user: {
        select: { id: true, language: true, currentCityId: true, telegramId: true },
      },
    },
  });

  const byUser = new Map<string, Recipient>();
  for (const row of rows) {
    const organizer = row.role === 'OWNER' || row.role === 'ADMIN';
    const existing = byUser.get(row.user.id);
    if (existing) {
      if (organizer) existing.role = 'organizer';
      continue;
    }
    byUser.set(row.user.id, {
      id: row.user.id,
      language: row.user.language,
      currentCityId: row.user.currentCityId,
      telegramId: row.user.telegramId,
      role: organizer ? 'organizer' : 'participant',
    });
  }
  return [...byUser.values()];
}

async function notifyGame(
  game: AlertGameRow,
  assessment: WeatherRiskAssessment,
  escalated: boolean,
): Promise<void> {
  if (shouldSuppressAllOutboundNotifications() || !canDispatchBroadcast('game-weather-alert')) {
    return;
  }

  const recipients = await loadRecipients(game.id);
  if (recipients.length === 0) return;

  const timeZone = await resolveGameTimezone(game.cityId);

  for (const recipient of recipients) {
    const language = recipient.language || 'en';
    const payload = createGameWeatherAlertPushNotification(
      {
        gameId: game.id,
        entityType: game.entityType,
        severity: assessment.severity,
        pop: assessment.pop,
        windKph: assessment.windKph,
        at: assessment.at,
        timeZone,
        place: describePlace(game, language),
        escalated,
        windDriven: assessment.windDriven,
      },
      { id: recipient.id, language, role: recipient.role },
    );

    try {
      await notificationService.sendNotification({
        userId: recipient.id,
        type: NotificationType.GAME_WEATHER_ALERT,
        payload,
        channels: [NotificationChannelType.PUSH],
      });
    } catch (error) {
      console.error(`[WeatherAlert] Push failed for user ${recipient.id}:`, error);
    }

    if (!recipient.telegramId) continue;
    try {
      const allowed = await NotificationPreferenceService.doesUserAllow(
        recipient.id,
        NotificationChannelType.TELEGRAM,
        PreferenceKey.SEND_WEATHER_ALERTS,
      );
      if (!allowed) continue;
      await telegramNotificationService.sendGameWeatherAlertNotification({
        telegramId: recipient.telegramId,
        language,
        title: payload.title,
        body: payload.body,
        gameId: game.id,
        isOrganizer: recipient.role === 'organizer',
      });
    } catch (error) {
      console.error(`[WeatherAlert] Telegram failed for user ${recipient.id}:`, error);
    }
  }
}

async function resolveGameTimezone(cityId: string): Promise<string | null> {
  try {
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { timezone: true },
    });
    return city?.timezone ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// "Keep as planned"
// ---------------------------------------------------------------------------

export interface WeatherAlertStateDto {
  severity: WeatherRiskSeverity;
  pop: number;
  windKph: number;
  at: string;
  windDriven: boolean;
  keptAsPlanned: boolean;
  keepAsPlannedAt: string | null;
  outdoor: boolean;
  outdoorCourtCount: number;
  totalCourtCount: number;
}

async function loadGameForAlert(gameId: string): Promise<AlertGameRow> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: ALERT_GAME_SELECT,
  });
  if (!game) throw new ApiError(404, 'errors.weather.gameNotFound');
  return game;
}

/**
 * Current risk for one game, for the details banner. Returns `severity: 'none'`
 * for indoor / unknown-court games and when there is simply no forecast — the
 * frontend renders nothing in both cases, never a "no data" banner.
 */
export async function getWeatherAlertState(gameId: string): Promise<WeatherAlertStateDto> {
  const game = await loadGameForAlert(gameId);
  const state = parseWeatherAlertState(game.weatherAlertState);
  const clubId = resolveClubId(game);
  const clubCourts =
    game.gameCourts.length === 0 && !game.court && clubId
      ? await loadClubActiveCourts([clubId])
      : new Map<string, { isIndoor: boolean }[]>();
  const detection = outdoorFor(game, clubCourts);

  const quiet: WeatherAlertStateDto = {
    severity: 'none',
    pop: 0,
    windKph: 0,
    at: game.startTime.toISOString(),
    windDriven: false,
    keptAsPlanned: Boolean(state?.keepAsPlannedAt),
    keepAsPlannedAt: state?.keepAsPlannedAt ?? null,
    outdoor: detection.outdoor,
    outdoorCourtCount: detection.outdoorCourtCount,
    totalCourtCount: detection.totalCourtCount,
  };

  if (!detection.known || !detection.outdoor) return quiet;

  const payloads = await getCachedForecastPayloadsForCities([game.cityId]);
  const hours = hoursForGame(payloads.get(game.cityId), game.startTime, game.endTime);
  if (hours.length === 0) return quiet;

  const assessment = classifyWeatherRisk(hours);
  return {
    ...quiet,
    severity: assessment.severity,
    pop: assessment.pop,
    windKph: assessment.windKph,
    at: assessment.at || quiet.at,
    windDriven: assessment.windDriven,
  };
}

/**
 * Records the organizer's "Keep as planned". Suppresses the 2 h alert and turns
 * the card pill neutral grey. Idempotent.
 */
export async function keepAsPlanned(
  gameId: string,
  userId: string,
  now: Date = new Date(),
): Promise<WeatherAlertStateDto> {
  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { id: true },
  });
  if (!participant) {
    throw new ApiError(403, 'errors.weather.notOrganizer');
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true },
  });
  if (!game) throw new ApiError(404, 'errors.weather.gameNotFound');

  await mergeKeepAsPlanned(gameId, now);

  const stored = await prisma.game.findUnique({
    where: { id: gameId },
    select: { weatherAlertState: true },
  });
  const state = parseWeatherAlertState(stored?.weatherAlertState);
  await emitGameWeatherAlertUpdated(gameId, { severity: state?.severity ?? 'none' });

  return getWeatherAlertState(gameId);
}

/**
 * Posts "Moved to Court 1 (indoor)" into the game chat after the organizer has
 * applied the court change through the normal edit path.
 *
 * It is a separate call on purpose: `GameUpdateService.updateGame` only
 * announces club and time changes, and teaching it to announce every court
 * change would put a chat line on edits that have nothing to do with weather.
 * This endpoint says nothing unless the court really is one of the game's own
 * indoor courts.
 */
export async function noteMovedIndoor(
  gameId: string,
  userId: string,
  courtId: string,
): Promise<{ posted: boolean }> {
  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId, role: { in: ['OWNER', 'ADMIN'] } },
    select: { id: true },
  });
  if (!participant) {
    throw new ApiError(403, 'errors.weather.notOrganizer');
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      courtId: true,
      gameCourts: { select: { courtId: true } },
    },
  });
  if (!game) throw new ApiError(404, 'errors.weather.gameNotFound');

  const belongsToGame =
    game.courtId === courtId || game.gameCourts.some((link) => link.courtId === courtId);
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    select: { name: true, isIndoor: true },
  });

  if (!belongsToGame || !court?.isIndoor) {
    // Nothing to announce — the move did not happen, or it was not indoors.
    return { posted: false };
  }

  const systemMessage = await createSystemMessage(gameId, {
    type: SystemMessageType.GAME_MOVED_INDOOR,
    variables: { courtName: court.name },
  });

  if (systemMessage) {
    const fullGame = await fetchGameWithDetails(gameId);
    if (fullGame) {
      notificationService
        .sendGameSystemMessageNotification(systemMessage, fullGame)
        .catch((error) => {
          console.error('[WeatherAlert] Failed to notify moved-indoor message:', error);
        });
    }
  }

  return { posted: true };
}

/** Push / Telegram entry point — a stale action degrades to `false`, never a 500. */
export async function keepAsPlannedFromAction(
  userId: string,
  gameId: string,
): Promise<boolean> {
  try {
    await keepAsPlanned(gameId, userId);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode < 500) return false;
    console.error('[WeatherAlert] Keep-as-planned action failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Find / My-tab card enrichment
// ---------------------------------------------------------------------------

export interface WeatherRiskEnrichInput {
  id: string;
  cityId?: string;
  startTime?: Date | string;
  endTime?: Date | string;
  timeIsSet?: boolean;
}

/**
 * Batched, cache-only, read-only. Runs on every Find page, so it must stay at a
 * constant number of queries regardless of page size.
 */
export async function computeWeatherRiskForGames(
  games: readonly WeatherRiskEnrichInput[],
  now: Date = new Date(),
): Promise<Record<string, WeatherRisk | null>> {
  const horizon = now.getTime() + WEATHER_RISK_CARD_HORIZON_HOURS * HOUR_MS;
  const candidates = games
    .filter((game) => game.timeIsSet !== false && game.cityId && game.startTime)
    .filter((game) => {
      const start = new Date(game.startTime as Date | string).getTime();
      return Number.isFinite(start) && start > now.getTime() && start <= horizon;
    })
    .slice(0, WEATHER_RISK_MAX_ENRICH_GAMES);

  if (candidates.length === 0) return {};

  const rows = await prisma.game.findMany({
    where: { id: { in: candidates.map((game) => game.id) } },
    select: {
      id: true,
      cityId: true,
      clubId: true,
      startTime: true,
      endTime: true,
      weatherAlertState: true,
      court: { select: { id: true, isIndoor: true, clubId: true } },
      gameCourts: {
        orderBy: { order: 'asc' as const },
        select: { court: { select: { id: true, isIndoor: true, clubId: true } } },
      },
    },
  });

  const needClubFallback = rows
    .filter((row) => row.gameCourts.length === 0 && !row.court)
    .map((row) => row.clubId)
    .filter((clubId): clubId is string => Boolean(clubId));

  const [payloads, clubCourts] = await Promise.all([
    getCachedForecastPayloadsForCities(rows.map((row) => row.cityId), now),
    loadClubActiveCourts(needClubFallback),
  ]);

  const result: Record<string, WeatherRisk | null> = {};
  for (const row of rows) {
    const detection = detectOutdoor({
      gameCourts: row.gameCourts.map((link) => ({ isIndoor: link.court.isIndoor })),
      primaryCourt: row.court ? { isIndoor: row.court.isIndoor } : null,
      clubActiveCourts: row.clubId ? clubCourts.get(row.clubId) ?? [] : [],
    });
    if (!detection.known || !detection.outdoor) {
      result[row.id] = null;
      continue;
    }

    const hours = hoursForGame(payloads.get(row.cityId), row.startTime, row.endTime);
    if (hours.length === 0) {
      result[row.id] = null;
      continue;
    }

    const assessment = classifyWeatherRisk(hours);
    if (!isAlertableSeverity(assessment.severity)) {
      result[row.id] = null;
      continue;
    }

    const state = parseWeatherAlertState(row.weatherAlertState);
    result[row.id] = {
      severity: assessment.severity,
      pop: assessment.pop,
      windKph: assessment.windKph,
      at: assessment.at || row.startTime.toISOString(),
      ...(state?.keepAsPlannedAt ? { keptAsPlanned: true } : {}),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Registrations (import-time; `gameWeather.routes.ts` imports this module)
// ---------------------------------------------------------------------------

registerPushActionHandler('weather', async (scope) => {
  if (scope.action !== 'keep') {
    return { success: false, message: 'errors.weather.invalidAction' };
  }
  const ok = await keepAsPlannedFromAction(scope.userId, scope.targetId);
  return ok
    ? { success: true, message: 'weather.keptAsPlanned' }
    : { success: false, message: 'errors.weather.notOrganizer' };
});

registerAvailableGamesEnricher('weatherRisk', async (_userId, games) => {
  const byGame = await computeWeatherRiskForGames(games);
  const result: Record<string, { weatherRisk: WeatherRisk | null }> = {};
  for (const game of games) {
    result[game.id] = { weatherRisk: byGame[game.id] ?? null };
  }
  return result;
});
