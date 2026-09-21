import { GameSeriesStatus, NotificationChannelType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { addOrUpdateParticipant } from '../../utils/participantOperations';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { validatePlayerCanJoinGame } from '../../utils/participantValidation';
import { NotificationType, PreferenceKey } from '../../types/notifications.types';
import notificationService from '../notification.service';
import { NotificationPreferenceService } from '../notificationPreference.service';
import { signPushInviteActionToken } from '../push/pushInviteActionToken.service';
import {
  registerPushActionHandler,
  type PushActionResult,
} from '../push/pushActionHandlers';
import telegramNotificationService from '../telegram/notification.service';
import { emitGameSeriesConfirmationsUpdated } from '../socketEmitFacade';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { GameSeriesGenerationService } from './gameSeriesGeneration.service';
import { invalidateSeriesDetailCache } from './gameSeries.service';
import { seriesT } from './gameSeriesCopy';
import { buildSeriesCardLabels } from './gameSeriesCardEnricher';
import type { SeriesCardLabel } from '../game/availableGamesEnrichmentTypes';
import { selectCarryOverRecipients } from './gameSeriesEditScope';
import { evaluateSeriesSeatClaim, isSeriesInsider, isSeriesManager } from './gameSeriesAccess';
import {
  dayKeyInTimezone,
  prismaDateToDayKey,
  seatDeadlineFor,
  type DayKey,
} from './gameSeriesOccurrenceDates';

/**
 * PRD 345 — the "same time next week?" carry-over.
 *
 * When an occurrence reaches FINAL, every **regular** who actually played gets a
 * one-tap prompt that seats them on the *next* occurrence. The prompt carries a
 * `kind: 'series'` push action token whose `targetId` is the next occurrence's
 * gameId, so the push shade, the Telegram buttons and the in-app card all go
 * through exactly one code path ({@link GameSeriesCarryOverService.acceptSeat}).
 *
 * Three invariants worth stating out loud:
 *
 * 1. **Nothing is reserved.** A regular who ignores the prompt simply never
 *    becomes PLAYING; the seat was open the whole time. "Release unclaimed
 *    seats N h before" is therefore a *display* deadline, not a job — there is
 *    no hold to release (PRD 345: "unclaimed regular seats remain open, no
 *    auto-invite").
 * 2. **Accept is idempotent.** It upserts one `GameParticipant`; a double tap
 *    from push + in-app is a no-op the second time.
 * 3. **Declining records nothing.** It answers the caller and stops, exactly as
 *    the PRD specifies, so a decline can never be mistaken for a "no" the next
 *    week.
 */

/**
 * Everything the game-details series surfaces need in one round trip: the
 * "Part of *Tuesday Regulars* · 12th week" label for **this** occurrence, and
 * the "same time next week?" state for the **next** one. Either half may be
 * null independently — a series with no future occurrence still has a label.
 */
export interface SeriesGameContext {
  label: SeriesCardLabel | null;
  viewerIsOwner: boolean;
  /**
   * The series knobs the Repeat sheet edits. Separate from `label` because
   * `SeriesCardLabel`'s shape is fixed by `Frontend/src/types/gameCardEnrichment.ts`
   * and must not be widened — without these the sheet would re-save the
   * defaults over whatever the organizer had chosen.
   */
  settings: {
    endsOn: DayKey | null;
    seatDeadlineHours: number;
    horizonDays: number;
  };
  next: SeriesNextOccurrencePrompt | null;
}

export interface SeriesNextOccurrencePrompt {
  seriesId: string;
  seriesName: string;
  cadence: string;
  ownerId: string;
  viewerIsOwner: boolean;
  viewerIsRegular: boolean;
  /** The occurrence the prompt seats you on. */
  nextGameId: string;
  nextStartTime: string;
  nextOccurrenceDate: DayKey | null;
  nextClubName: string | null;
  /** Instant the UI shows as "your seat opens to others on …". */
  seatDeadlineAt: string;
  confirmedCount: number;
  regularCount: number;
  viewerIsPlaying: boolean;
  /** Avatars for the organizer strip, roster order. */
  regulars: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    confirmed: boolean;
  }[];
}

const PROMPT_GAME_SELECT = {
  id: true,
  seriesId: true,
  seriesOccurrenceDate: true,
  startTime: true,
  status: true,
  resultsStatus: true,
  cityId: true,
  maxParticipants: true,
  club: { select: { name: true } },
} satisfies Prisma.GameSelect;

async function activeRegularUserIds(seriesId: string): Promise<string[]> {
  const rows = await prisma.gameSeriesRegular.findMany({
    where: { seriesId, removedAt: null },
    select: { userId: true },
    orderBy: { addedAt: 'asc' },
  });
  return rows.map((row) => row.userId);
}

type PromptGame = Prisma.GameGetPayload<{ select: typeof PROMPT_GAME_SELECT }>;

/**
 * The series' next joinable occurrence, resolved **server-side**.
 *
 * `acceptSeat` compares the caller's `gameId` against this, so the caller can
 * never redirect a carry-over seat at an arbitrary game of the series (or at a
 * game of some other series that happens to share an id they know).
 */
async function nextOccurrenceOf(
  seriesId: string,
  excludeGameId?: string,
): Promise<PromptGame | null> {
  return prisma.game.findFirst({
    where: {
      seriesId,
      ...(excludeGameId ? { id: { not: excludeGameId } } : {}),
      startTime: { gt: new Date() },
      resultsStatus: 'NONE',
      status: { not: 'ARCHIVED' },
    },
    select: PROMPT_GAME_SELECT,
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Persisted, one-shot claim on the carry-over fan-out for a finished
 * occurrence (CONTRACT §5.4 — "a delivery table or a persisted timestamp",
 * never an in-memory Set).
 *
 * `recalculateGameOutcomes` re-runs on every score correction and on every
 * late substitution, so without this a single typo fix re-pushes "Same time
 * next week?" to every regular who has not yet accepted.
 *
 * The marker lives under `Game.metadata.seriesCarryOver` and records which
 * occurrence was offered: if the organizer skips the next occurrence and the
 * generator materialises a different one, the id changes and a fresh prompt is
 * legitimate. The conditional `UPDATE` is the atomic claim — its row count is
 * the answer, so two concurrent finalizations cannot both win.
 */
async function claimCarryOverFanOut(
  sourceGameId: string,
  nextGameId: string,
  now: Date,
): Promise<boolean> {
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Game"
    SET "metadata" = jsonb_set(
      CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END,
      '{seriesCarryOver}',
      jsonb_build_object('nextGameId', ${nextGameId}::text, 'promptedAt', ${now.toISOString()}::text),
      true
    )
    WHERE "id" = ${sourceGameId}
      AND COALESCE("metadata" -> 'seriesCarryOver' ->> 'nextGameId', '') <> ${nextGameId}
  `);
  return claimed > 0;
}

async function playingUserIds(gameId: string): Promise<string[]> {
  const rows = await prisma.gameParticipant.findMany({
    where: { gameId, status: 'PLAYING' },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

/** Broadcast the confirmation counter the organizer strip renders live. */
async function publishConfirmations(seriesId: string, gameId: string): Promise<void> {
  const [regulars, playing] = await Promise.all([
    activeRegularUserIds(seriesId),
    playingUserIds(gameId),
  ]);
  const playingSet = new Set(playing);
  await emitGameSeriesConfirmationsUpdated(gameId, {
    seriesId,
    confirmedCount: regulars.filter((userId) => playingSet.has(userId)).length,
    regularCount: regulars.length,
  });
}

export class GameSeriesCarryOverService {
  /**
   * Post-commit hook for an occurrence reaching FINAL. Never call this inside a
   * transaction: it creates the next occurrence (which runs the whole
   * `GameCreateService` path) and sends notifications.
   */
  static async onOccurrenceFinalized(gameId: string): Promise<{ prompted: number }> {
    if (!config.gameSeriesEnabled) return { prompted: 0 };

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        seriesId: true,
        resultsStatus: true,
      },
    });
    if (!game?.seriesId) return { prompted: 0 };
    // `resultsStatus` is the state machine; `Game.status` is clock-derived and
    // must never gate a state-changing path (docs/product/constraints.md) —
    // and this path *creates games* through `generateForSeries`.
    if (game.resultsStatus !== 'FINAL') {
      return { prompted: 0 };
    }

    const series = await prisma.gameSeries.findUnique({
      where: { id: game.seriesId },
      select: { id: true, name: true, ownerId: true, status: true, seatDeadlineHours: true },
    });
    if (!series || series.status !== GameSeriesStatus.ACTIVE) return { prompted: 0 };

    // Make sure there *is* a next week to offer before promising one.
    await GameSeriesGenerationService.generateForSeries(series.id);

    const next = await nextOccurrenceOf(series.id, game.id);
    if (!next) return { prompted: 0 };

    // Claim before sending: a crash between the two drops a prompt, which is
    // recoverable; the other order spams a whole roster on every results edit.
    const claimed = await claimCarryOverFanOut(game.id, next.id, new Date());
    if (!claimed) return { prompted: 0 };

    const [regulars, playedHere, alreadyOnNext] = await Promise.all([
      activeRegularUserIds(series.id),
      playingUserIds(game.id),
      playingUserIds(next.id),
    ]);

    const recipients = selectCarryOverRecipients({ playedHere, regulars, alreadyOnNext });
    if (recipients.length === 0) return { prompted: 0 };

    const seatDeadlineAt = seatDeadlineFor(next.startTime, series.seatDeadlineHours);
    let prompted = 0;
    for (const userId of recipients) {
      const sent = await GameSeriesCarryOverService.sendPromptTo(userId, {
        seriesId: series.id,
        seriesName: series.name,
        sourceGameId: game.id,
        nextGameId: next.id,
        nextStartTime: next.startTime,
        clubName: next.club?.name ?? null,
        cityId: next.cityId,
        seatDeadlineAt,
      }).catch((error: unknown) => {
        console.error('[GameSeriesCarryOver] prompt failed', {
          seriesId: series.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      });
      if (sent) prompted += 1;
    }

    return { prompted };
  }

  private static async sendPromptTo(
    userId: string,
    context: {
      seriesId: string;
      seriesName: string;
      /** The finished occurrence that raised the prompt — where the in-app card lives. */
      sourceGameId: string;
      nextGameId: string;
      nextStartTime: Date;
      clubName: string | null;
      cityId: string | null;
      seatDeadlineAt: Date;
    },
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, language: true, telegramId: true },
    });
    if (!user) return false;

    const lang = user.language || 'en';
    const timezone = await getUserTimezoneFromCityId(context.cityId);
    const when = new Intl.DateTimeFormat(lang === 'sr' ? 'sr-Latn' : lang, {
      timeZone: timezone || 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(context.nextStartTime);

    const title = seriesT('series.nextWeekTitle', lang);
    const body = context.clubName
      ? seriesT('series.nextWeekBodyAtClub', lang, {
          when,
          club: context.clubName,
          series: context.seriesName,
        })
      : seriesT('series.nextWeekBody', lang, { when, series: context.seriesName });

    const acceptToken = signPushInviteActionToken({
      userId,
      kind: 'series',
      targetId: context.nextGameId,
      action: 'accept',
    });
    const declineToken = signPushInviteActionToken({
      userId,
      kind: 'series',
      targetId: context.nextGameId,
      action: 'decline',
    });

    const result = await notificationService.sendNotification({
      userId,
      type: NotificationType.GAME_SERIES_NEXT_PROMPT,
      channels: [NotificationChannelType.PUSH],
      payload: {
        type: NotificationType.GAME_SERIES_NEXT_PROMPT,
        title,
        body,
        data: {
          gameId: context.nextGameId,
          sourceGameId: context.sourceGameId,
          seriesId: context.seriesId,
          acceptActionToken: acceptToken,
          declineActionToken: declineToken,
          // The native shade handlers never see a response body, so both
          // acknowledgements travel with the prompt (same contract as PRD 346).
          seriesAcceptAck: seriesT('series.seatKept', lang),
          seriesDeclineAck: seriesT('series.seatReleased', lang),
        },
        actions: [
          { id: 'accept', title: seriesT('series.actionImIn', lang), action: 'accept' },
          {
            id: 'decline',
            title: seriesT('series.actionNotThisTime', lang),
            action: 'decline',
          },
        ],
        sound: 'default',
      },
    });

    let telegram = false;
    if (user.telegramId) {
      const allowed = await NotificationPreferenceService.doesUserAllow(
        userId,
        NotificationChannelType.TELEGRAM,
        PreferenceKey.SEND_INVITES,
      );
      if (allowed) {
        telegram = await telegramNotificationService.sendGameSeriesNextPromptNotification({
          telegramId: user.telegramId,
          language: lang,
          title,
          body,
          gameId: context.nextGameId,
        });
      }
    }

    return result.push || telegram;
  }

  /**
   * Seat a regular on the next occurrence. Shared by the push shade, the
   * Telegram buttons and the in-app "I'm in" card.
   *
   * Three things this method must never skip, because `gameId` arrives from a
   * push token or a request body and is therefore attacker-controlled:
   *
   * 1. **Entitlement** — the caller has to be on the roster *right now*
   *    (`evaluateSeriesSeatClaim`), and the game they named has to be the id
   *    the server independently resolves as the series' next occurrence.
   * 2. **The ordinary join rules** — `validatePlayerCanJoinGame` runs the
   *    roster lock, the level band, the gender rule and the capacity check,
   *    exactly as `ParticipantService.joinGame` does. Being a regular skips
   *    the *invite*, never the rules of the game.
   * 3. **A row lock** — the capacity check and the insert happen behind
   *    `SELECT … FOR UPDATE` on the game row, so two taps cannot both read a
   *    free seat (the previous in-transaction `count` took no locks and bought
   *    nothing under READ COMMITTED).
   */
  static async acceptSeat(userId: string, gameId: string): Promise<PushActionResult> {
    if (!config.gameSeriesEnabled) {
      return { success: false, message: 'errors.series.disabled' };
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: PROMPT_GAME_SELECT,
    });
    if (!game?.seriesId) {
      return { success: false, message: 'errors.series.notAnOccurrence' };
    }
    if (game.resultsStatus !== 'NONE' || game.status === 'ARCHIVED') {
      return { success: false, message: 'errors.series.occurrenceClosed' };
    }
    if (game.startTime.getTime() <= Date.now()) {
      return { success: false, message: 'errors.series.occurrenceClosed' };
    }

    const series = await prisma.gameSeries.findUnique({
      where: { id: game.seriesId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!series) return { success: false, message: 'errors.series.notFound' };

    const [regular, nextOccurrence] = await Promise.all([
      prisma.gameSeriesRegular.findUnique({
        where: { seriesId_userId: { seriesId: series.id, userId } },
        select: { removedAt: true },
      }),
      nextOccurrenceOf(series.id),
    ]);

    const claim = evaluateSeriesSeatClaim({
      actorId: userId,
      seriesOwnerId: series.ownerId,
      seriesStatus: series.status,
      actorIsActiveRegular: Boolean(regular) && regular?.removedAt == null,
      requestedGameId: gameId,
      nextOccurrenceId: nextOccurrence?.id ?? null,
    });
    if (!claim.allowed) {
      return { success: false, message: claim.refusal };
    }

    const alreadyPlaying = await prisma.gameParticipant.findFirst({
      where: { gameId, userId, status: 'PLAYING' },
      select: { id: true },
    });
    if (alreadyPlaying) {
      await publishConfirmations(series.id, gameId);
      return { success: true, message: 'series.seatKept' };
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Serialise concurrent claims on this occurrence (house pattern, see
        // `gameTeam.service.ts`): without it the capacity check below is a
        // check-then-act that two simultaneous taps both pass.
        await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);

        const gameInTx = await fetchGameWithPlayingParticipants(tx, gameId);
        const joinResult = await validatePlayerCanJoinGame(gameInTx, userId);
        if (!joinResult.canJoin) {
          throw new ApiError(409, joinResult.reason ?? 'errors.series.occurrenceFull', true, {
            code: 'series.seatRefused',
          });
        }

        await addOrUpdateParticipant(tx, gameId, userId, {
          role: ParticipantRole.PARTICIPANT,
          status: 'PLAYING',
        });
        await tx.gameParticipant.updateMany({
          where: { gameId, userId },
          data: { invitedByUserId: series.ownerId },
        });
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return { success: false, message: error.message };
      }
      throw error;
    }

    invalidateSeriesDetailCache(series.id);
    await publishConfirmations(series.id, gameId);
    return { success: true, message: 'series.seatKept' };
  }

  /**
   * "Not this time". Deliberately records nothing — the seat was never held, so
   * there is nothing to release and nothing to remember (PRD 345).
   */
  static async declineSeat(userId: string, gameId: string): Promise<PushActionResult> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, seriesId: true },
    });
    if (!game?.seriesId) {
      return { success: false, message: 'errors.series.notAnOccurrence' };
    }
    return { success: true, message: 'series.seatReleased' };
  }

  /**
   * The series context for one occurrence: its own label and the next
   * occurrence's prompt. `null` only when the game is not part of a series at
   * all, which is the signal to render nothing.
   *
   * The `label` is public by design (PRD 345 user story 10 — a newcomer sees
   * "Weekly · Tuesdays 19:00" on any card). The `next` block is **not**: it
   * carries the series owner, the next occurrence's id and every regular's
   * name and avatar, so it is served only to series insiders (owner, admin,
   * active regular, or a participant of this occurrence). Without that gate
   * this endpoint is the discovery step of a roster takeover.
   */
  static async getSeriesContext(
    gameId: string,
    viewerId: string,
    isAdmin = false,
  ): Promise<SeriesGameContext | null> {
    if (!config.gameSeriesEnabled) return null;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, seriesId: true },
    });
    if (!game?.seriesId) return null;

    const series = await prisma.gameSeries.findUnique({
      where: { id: game.seriesId },
      select: {
        id: true,
        name: true,
        cadence: true,
        ownerId: true,
        status: true,
        seatDeadlineHours: true,
        horizonDays: true,
        endsOn: true,
      },
    });
    if (!series) return null;

    const [labels, regularRow, participantRow] = await Promise.all([
      buildSeriesCardLabels([gameId]),
      prisma.gameSeriesRegular.findUnique({
        where: { seriesId_userId: { seriesId: series.id, userId: viewerId } },
        select: { removedAt: true },
      }),
      prisma.gameParticipant.findFirst({
        where: { gameId, userId: viewerId },
        select: { id: true },
      }),
    ]);
    const label = labels[gameId] ?? null;
    const viewerIsOwner = isSeriesManager({
      seriesOwnerId: series.ownerId,
      actorId: viewerId,
      isAdmin,
    });
    const settings = {
      endsOn: series.endsOn ? prismaDateToDayKey(series.endsOn) : null,
      seatDeadlineHours: series.seatDeadlineHours,
      horizonDays: series.horizonDays,
    };

    const insider = isSeriesInsider({
      viewerId,
      seriesOwnerId: series.ownerId,
      isAdmin,
      viewerIsActiveRegular: Boolean(regularRow) && regularRow?.removedAt == null,
      viewerIsOccurrenceParticipant: participantRow !== null,
    });

    if (!insider || series.status !== GameSeriesStatus.ACTIVE) {
      return { label, viewerIsOwner, settings, next: null };
    }

    const next = await nextOccurrenceOf(series.id, gameId);
    if (!next) return { label, viewerIsOwner, settings, next: null };

    const [regularRows, playing] = await Promise.all([
      prisma.gameSeriesRegular.findMany({
        where: { seriesId: series.id, removedAt: null },
        select: {
          userId: true,
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
        orderBy: { addedAt: 'asc' },
      }),
      playingUserIds(next.id),
    ]);
    const playingSet = new Set(playing);

    const regulars = regularRows.map((row) => ({
      userId: row.userId,
      firstName: row.user?.firstName ?? null,
      lastName: row.user?.lastName ?? null,
      avatar: row.user?.avatar ?? null,
      confirmed: playingSet.has(row.userId),
    }));

    const timezone = await getUserTimezoneFromCityId(next.cityId);

    return {
      label,
      viewerIsOwner,
      settings,
      next: {
        seriesId: series.id,
        seriesName: series.name,
        cadence: series.cadence,
        ownerId: series.ownerId,
        viewerIsOwner,
        viewerIsRegular: regulars.some((regular) => regular.userId === viewerId),
        nextGameId: next.id,
        nextStartTime: next.startTime.toISOString(),
        nextOccurrenceDate: next.seriesOccurrenceDate
          ? prismaDateToDayKey(next.seriesOccurrenceDate)
          : dayKeyInTimezone(next.startTime, timezone),
        nextClubName: next.club?.name ?? null,
        seatDeadlineAt: seatDeadlineFor(next.startTime, series.seatDeadlineHours).toISOString(),
        confirmedCount: regulars.filter((regular) => regular.confirmed).length,
        regularCount: regulars.length,
        viewerIsPlaying: playingSet.has(viewerId),
        regulars,
      },
    };
  }
}

/**
 * Registered at import time. `series.routes.ts` imports the controller, which
 * imports this module, and `routes/index.ts` already mounts that router — so the
 * chain reaches `app.ts` without anybody remembering to wire it.
 */
registerPushActionHandler('series', async (scope) =>
  scope.action === 'accept'
    ? GameSeriesCarryOverService.acceptSeat(scope.userId, scope.targetId)
    : GameSeriesCarryOverService.declineSeat(scope.userId, scope.targetId),
);

export { selectCarryOverRecipients };
