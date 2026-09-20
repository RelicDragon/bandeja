import { GameSeriesStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { GameCreateService } from '../game/create.service';
import { GameDeleteService } from '../game/delete.service';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import {
  addDaysToDayKey,
  dayKeyInTimezone,
  dayKeyToPrismaDate,
  horizonThroughDayKey,
  listOccurrenceDayKeys,
  occurrenceEndUtc,
  occurrenceStartUtc,
  prismaDateToDayKey,
  type DayKey,
  type GameSeriesCadenceValue,
} from './gameSeriesOccurrenceDates';
import {
  buildOccurrenceCreatePayload,
  parseGameSeriesTemplate,
  type GameSeriesTemplate,
} from './gameSeriesTemplate';

/**
 * PRD 345 — materialises `GameSeries` occurrences a fixed horizon ahead.
 *
 * Every occurrence goes through {@link GameCreateService.createGame} with the
 * stored template, so `validateGameForSport`, the club/court/sport checks, the
 * booking sync, readiness and the play-intent queue all run exactly as they do
 * for a hand-made game. Nothing here writes a `Game` row directly.
 *
 * **Idempotency is a database invariant, not a code convention.** Schedulers
 * retry, and `runOnce` can be called from a request handler at the same time as
 * the nightly cron. `Game.@@unique([seriesId, seriesOccurrenceDate])` is what
 * actually guarantees one game per date; the pre-read below is only an
 * optimisation, and the `P2002` branch is the real correctness path.
 */

export interface GeneratedOccurrence {
  gameId: string;
  occurrenceDayKey: DayKey;
  startTime: Date;
  created: boolean;
}

export interface GenerateOccurrencesResult {
  seriesId: string;
  created: GeneratedOccurrence[];
  /** Dates already present (nothing to do) or skipped by the organizer. */
  skippedDayKeys: DayKey[];
  errors: { occurrenceDayKey: DayKey; message: string }[];
  /** The series was closed because it ran past `endsOn`. */
  endedByHorizon: boolean;
}

/** Series shape the generator needs. Keeps the query explicit and cheap. */
const seriesForGenerationSelect = {
  id: true,
  ownerId: true,
  name: true,
  cadence: true,
  weekday: true,
  startTimeLocal: true,
  durationMinutes: true,
  clubId: true,
  courtIds: true,
  template: true,
  horizonDays: true,
  endsOn: true,
  status: true,
} satisfies Prisma.GameSeriesSelect;

type SeriesForGeneration = Prisma.GameSeriesGetPayload<{
  select: typeof seriesForGenerationSelect;
}>;

/**
 * In-process guard so two overlapping passes for the same series do not both
 * walk into `createGame`. It is *not* a correctness mechanism across nodes —
 * the unique index is — but it keeps the common case from creating and then
 * deleting a game for nothing.
 */
const inFlightSeriesIds = new Set<string>();

async function resolveSeriesCityId(
  series: SeriesForGeneration,
  template: GameSeriesTemplate,
): Promise<string | null> {
  if (typeof template.cityId === 'string' && template.cityId.length > 0) {
    return template.cityId;
  }
  if (series.clubId) {
    const club = await prisma.club.findUnique({
      where: { id: series.clubId },
      select: { cityId: true },
    });
    if (club?.cityId) return club.cityId;
  }
  const occurrence = await prisma.game.findFirst({
    where: { seriesId: series.id },
    select: { cityId: true },
    orderBy: { startTime: 'desc' },
  });
  return occurrence?.cityId ?? null;
}

async function ownerIsRegular(seriesId: string, ownerId: string): Promise<boolean> {
  const row = await prisma.gameSeriesRegular.findUnique({
    where: { seriesId_userId: { seriesId, userId: ownerId } },
    select: { removedAt: true },
  });
  return Boolean(row) && row?.removedAt == null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Attach the occurrence identity to a freshly created game.
 *
 * `GameCreateService.createGame` has no series parameter by design — widening
 * its `any` payload would mean touching a 900-line hot path shared by eight
 * other flows. Stamping the two columns immediately afterwards keeps the create
 * path byte-identical and still lands on the unique index: if a concurrent pass
 * won the race, this update raises `P2002` and we roll the duplicate back
 * through `GameDeleteService` (results-free and childless by construction, so
 * it always accepts).
 */
async function stampOccurrenceOrRollback(
  gameId: string,
  seriesId: string,
  occurrenceDayKey: DayKey,
  ownerId: string,
): Promise<boolean> {
  try {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        seriesId,
        seriesOccurrenceDate: dayKeyToPrismaDate(occurrenceDayKey),
      },
    });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    try {
      await GameDeleteService.deleteGame(gameId, ownerId);
    } catch (deleteError) {
      console.error('[GameSeriesGeneration] failed to roll back duplicate occurrence', {
        seriesId,
        occurrenceDayKey,
        gameId,
        error: deleteError instanceof Error ? deleteError.message : String(deleteError),
      });
    }
    return false;
  }
}

/**
 * Fire a deferred discovery announcement, if `createGame` handed us one.
 *
 * A function rather than an inline `if` so TypeScript's control-flow analysis
 * does not narrow the captured variable to `null` at the call site — the
 * assignment happens inside a callback the compiler cannot follow.
 */
function runDeferredAnnouncement(announce: (() => void) | null): void {
  if (announce) announce();
}

export class GameSeriesGenerationService {
  /**
   * Fill the horizon for one series. Safe to call repeatedly: an occurrence that
   * already exists is reported under `skippedDayKeys`, never recreated.
   */
  static async generateForSeries(
    seriesId: string,
    now: Date = new Date(),
  ): Promise<GenerateOccurrencesResult> {
    const empty: GenerateOccurrencesResult = {
      seriesId,
      created: [],
      skippedDayKeys: [],
      errors: [],
      endedByHorizon: false,
    };

    if (inFlightSeriesIds.has(seriesId)) return empty;
    inFlightSeriesIds.add(seriesId);
    try {
      return await GameSeriesGenerationService.generateForSeriesUnguarded(seriesId, now);
    } finally {
      inFlightSeriesIds.delete(seriesId);
    }
  }

  private static async generateForSeriesUnguarded(
    seriesId: string,
    now: Date,
  ): Promise<GenerateOccurrencesResult> {
    const result: GenerateOccurrencesResult = {
      seriesId,
      created: [],
      skippedDayKeys: [],
      errors: [],
      endedByHorizon: false,
    };

    const series = await prisma.gameSeries.findUnique({
      where: { id: seriesId },
      select: seriesForGenerationSelect,
    });
    if (!series || series.status !== GameSeriesStatus.ACTIVE) return result;

    const template = parseGameSeriesTemplate(series.template);
    if (!template) {
      result.errors.push({
        occurrenceDayKey: '',
        message: 'series.templateUnreadable',
      });
      console.error('[GameSeriesGeneration] unreadable template', { seriesId });
      return result;
    }

    const cityId = await resolveSeriesCityId(series, template);
    const timezone = await getUserTimezoneFromCityId(cityId);
    const todayDayKey = dayKeyInTimezone(now, timezone);
    const endsOnDayKey = series.endsOn ? prismaDateToDayKey(series.endsOn) : null;

    if (endsOnDayKey && endsOnDayKey < todayDayKey) {
      await prisma.gameSeries.update({
        where: { id: seriesId },
        data: { status: GameSeriesStatus.ENDED },
      });
      result.endedByHorizon = true;
      return result;
    }

    const throughDayKey = horizonThroughDayKey(todayDayKey, series.horizonDays);
    const skips = await prisma.gameSeriesSkip.findMany({
      where: { seriesId },
      select: { occurrenceDate: true },
    });

    const wanted = listOccurrenceDayKeys({
      anchorDayKey: template.anchorDayKey,
      cadence: series.cadence as GameSeriesCadenceValue,
      fromDayKey: todayDayKey,
      throughDayKey,
      endsOnDayKey,
      skipDayKeys: skips.map((skip) => prismaDateToDayKey(skip.occurrenceDate)),
    });
    if (wanted.length === 0) return result;

    const existing = await prisma.game.findMany({
      where: {
        seriesId,
        seriesOccurrenceDate: {
          in: wanted.map(dayKeyToPrismaDate),
        },
      },
      select: { id: true, seriesOccurrenceDate: true },
    });
    const existingDayKeys = new Set(
      existing
        .map((row) => (row.seriesOccurrenceDate ? prismaDateToDayKey(row.seriesOccurrenceDate) : null))
        .filter((key): key is DayKey => key !== null),
    );

    const ownerPlays = await ownerIsRegular(seriesId, series.ownerId);

    for (const occurrenceDayKey of wanted) {
      if (existingDayKeys.has(occurrenceDayKey)) {
        result.skippedDayKeys.push(occurrenceDayKey);
        continue;
      }

      const startTime = occurrenceStartUtc(occurrenceDayKey, series.startTimeLocal, timezone);
      if (startTime.getTime() <= now.getTime()) {
        // Today's slot already passed — never back-fill a game nobody can join.
        result.skippedDayKeys.push(occurrenceDayKey);
        continue;
      }
      const endTime = occurrenceEndUtc(startTime, series.durationMinutes);

      const payload = buildOccurrenceCreatePayload({
        template,
        startTime,
        endTime,
        clubId: series.clubId,
        courtIds: series.courtIds,
        cityId,
        ownerParticipates: ownerPlays,
        ownerUserId: series.ownerId,
      });

      let createdGameId: string | null = null;
      try {
        // Hold the city-wide "new game" push until the occurrence has won the
        // `(seriesId, seriesOccurrenceDate)` claim. Two nodes can generate the
        // same date at once; the loser's game is deleted, and a push for a
        // game that no longer exists deep-links every matching play-intent
        // user in the city to a 404.
        let announceOccurrence: (() => void) | null = null;
        const created = await GameCreateService.createGame(payload, series.ownerId, false, {
          deferDiscoveryAnnouncement: (announce) => {
            announceOccurrence = announce;
          },
        });
        createdGameId = created?.id ?? null;
        if (!createdGameId) {
          result.errors.push({
            occurrenceDayKey,
            message: 'series.occurrenceCreateReturnedNothing',
          });
          continue;
        }

        const stamped = await stampOccurrenceOrRollback(
          createdGameId,
          seriesId,
          occurrenceDayKey,
          series.ownerId,
        );
        if (!stamped) {
          result.skippedDayKeys.push(occurrenceDayKey);
          continue;
        }

        runDeferredAnnouncement(announceOccurrence);

        result.created.push({
          gameId: createdGameId,
          occurrenceDayKey,
          startTime,
          created: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ occurrenceDayKey, message });
        console.error('[GameSeriesGeneration] occurrence creation failed', {
          seriesId,
          occurrenceDayKey,
          message,
        });
      }
    }

    return result;
  }

  /**
   * One sweep over every `ACTIVE` series. Batched by id so a large tenant does
   * not hold the whole table in memory.
   */
  static async generateForAllActiveSeries(
    now: Date = new Date(),
    batchSize = 100,
  ): Promise<{ seriesCount: number; createdCount: number; errorCount: number }> {
    let cursor: string | undefined;
    let seriesCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    for (;;) {
      const batch = await prisma.gameSeries.findMany({
        where: { status: GameSeriesStatus.ACTIVE },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;

      for (const { id } of batch) {
        seriesCount += 1;
        try {
          const outcome = await GameSeriesGenerationService.generateForSeries(id, now);
          createdCount += outcome.created.length;
          errorCount += outcome.errors.length;
        } catch (error) {
          errorCount += 1;
          console.error('[GameSeriesGeneration] series pass failed', {
            seriesId: id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < batchSize) break;
    }

    return { seriesCount, createdCount, errorCount };
  }

  /**
   * Close every `ACTIVE` series whose `endsOn` is unambiguously in the past.
   *
   * `endsOn` is a club-**local** day key, and this bulk pass has no timezone to
   * compare it against. Real offsets span UTC-12…UTC+14, so "yesterday in UTC"
   * can still be today somewhere: the cutoff is pulled back a further day and
   * the precise, timezone-aware close stays in `generateForSeriesUnguarded`,
   * which runs for every active series on the same daily pass. Closing a day
   * late is invisible; closing early silently deletes a final occurrence.
   */
  static async closeExpiredSeries(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime());
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - 1);
    const { count } = await prisma.gameSeries.updateMany({
      where: {
        status: GameSeriesStatus.ACTIVE,
        endsOn: { lt: cutoff },
      },
      data: { status: GameSeriesStatus.ENDED },
    });
    return count;
  }

  /** Test seam — the in-process guard is module state. */
  static resetInFlightForTests(): void {
    inFlightSeriesIds.clear();
  }
}

export const nextOccurrenceDayKeyAfter = (dayKey: DayKey, cadence: GameSeriesCadenceValue): DayKey =>
  addDaysToDayKey(dayKey, cadence === 'BIWEEKLY' ? 14 : 7);
