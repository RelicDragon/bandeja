/**
 * `cancel_game` (booking phase 7e, docs/plans/ai-agent-booking.md §14.2, §14.4, §14.6). Critical
 * write: never auto-approved, no "Always allow".
 *
 * Guards (propose AND confirm, fresh principal at confirm), same as `DELETE /games/:id`:
 *   1. `assertAgentGamePermission([OWNER])`: agent visibility first (hidden → 404), then the HTTP
 *      rule (`requireGamePermission([OWNER])`: archived → 400, not the owner / parent owner → 403);
 *   2. `GameDeleteService.assertDeletable`: results or child games → 400 (so a league season with
 *      fixtures is refused exactly like the HTTP delete).
 *
 * Execution is `GameDeleteService.deleteGame`, the service `DELETE /games/:id` runs: CancelledGame
 * row, chat archived, open invites closed, participants notified.
 *
 * Game-only: linked court bookings are unlinked with the game (their rows cascade) but the
 * reservations at the club stay active, and the preview says so. Open coin bets and paid cost
 * shares are not a refusal (owner decision #4): the preview notes they will be refunded or
 * cancelled. `cancelBookings: true` on a game with linked bookings goes through
 * `proposeCancelWithBookings` (slice 7g): a client-executed plan — the app cancels the
 * reservations the user may cancel, then the post-step deletes the game only if all of them
 * were cancelled (else unlinks the cancelled ones and keeps the game, `partial`).
 */
import { BetStatus, ParticipantRole, type ClubIntegrationType } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { GameDeleteService } from '../../game/delete.service';
import { assertAgentGamePermission } from '../access/agentGameAccess';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { proposeAgentAction } from '../agentActionPropose';
import {
  agentCancelledBookingSchema,
  clubLocalPlanTime,
  markMirrorBookingCancelled,
  toAgentCancelledBooking,
  unlinkCancelledBooking,
} from '../booking/agentBookingCancel';
import { AGENT_CANCELLABLE_PROVIDERS, resolveBookingRef, type AgentBookingItem } from '../booking/agentBookingSources';
import { supportsClientExecution } from '../clientExecution/clientCaps';
import { proposeClientExecutedAction, readClientExecutedPlan } from '../clientExecution/clientPlan';
import { registerAgentClientPostStep, type AgentClientPostStepInput } from '../clientExecution/clientPostSteps';
import { agentGameTitle } from '../dto/game.dto';
import { agentCancelGameT } from '../i18n/agentCancelGameI18n';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import {
  defineTool,
  type AgentToolContext,
  type AgentToolResult,
  type AgentWriteContext,
  type AgentWriteOutcome,
} from './registry';
import { clip, gameEntityFor, gameTimezone, line, loadGameForWrite, parsePlan, when, type GameWriteRow } from './writeHelpers';

const CANCEL_ROLES: ParticipantRole[] = [ParticipantRole.OWNER];
/** Bets whose coins are still in play (a delete refunds / cancels them). */
const OPEN_BET_STATUSES: BetStatus[] = [BetStatus.OPEN, BetStatus.ACCEPTED, BetStatus.NEEDS_REVIEW];

export const gameHandoffPath = (gameId: string): string => `/games/${gameId}`;

const cancelGameInput = z
  .object({
    gameId: z.string().min(1).max(64),
    cancelBookings: z
      .boolean()
      .describe(
        "true = also cancel the game's court reservations at the club; false = cancel only the game (the reservations stay active)",
      ),
  })
  .strict();

const cancelGamePlanSchema = z
  .object({
    gameId: z.string(),
    mode: z.literal('game_only'),
    /** Bookings linked at propose time (for the result line; the delete unlinks whatever is linked then). */
    externalBookingIds: z.array(z.string()),
  })
  .strict();
type CancelGamePlan = z.infer<typeof cancelGamePlanSchema>;

/** Server-only payload (`plan.post`) of the client-executed with-bookings plan. */
const cancelGameWithBookingsPostSchema = z
  .object({
    gameId: z.string(),
    /** Planned cancellations (server-resolved rows; never model input). */
    bookings: z.array(agentCancelledBookingSchema).min(1).max(8),
    /** Localized labels of linked bookings that stay active (shared / not the user's / club-only). */
    staying: z.array(z.string().max(300)).max(50),
  })
  .strict();
type CancelGameWithBookingsPost = z.infer<typeof cancelGameWithBookingsPostSchema>;

/** `AgentClientPlan.bookings` holds at most 8 provider calls. */
const AGENT_CLIENT_PLAN_MAX = 8;

/** A court booking linked to the game. `externalBookingId` is internal: never sent to the model. */
export type CancelGameLinkedBooking = {
  /** `GameExternalBooking.id` (the `geb:` bookingRef). */
  gebId: string;
  externalBookingId: string;
  provider: ClubIntegrationType;
  label: string;
  /** Other games this reservation is linked to (a shared reservation). */
  otherGames: number;
};

// --- guards ------------------------------------------------------------------------------------

/** The `DELETE /games/:id` rules, behind the agent's visibility check. */
async function authorizeCancelGame(principal: AgentPrincipal, gameId: string): Promise<GameWriteRow> {
  await assertAgentGamePermission(principal, gameId, CANCEL_ROLES);
  const game = await loadGameForWrite(gameId);
  await GameDeleteService.assertDeletable(game);
  return game;
}

// --- preview data ------------------------------------------------------------------------------

async function loadLinkedBookings(game: GameWriteRow, timezone: string, locale: string): Promise<CancelGameLinkedBooking[]> {
  const rows = await prisma.gameExternalBooking.findMany({
    where: { gameId: game.id },
    select: {
      id: true,
      externalBookingId: true,
      externalBookingProvider: true,
      bookingStart: true,
      bookingEnd: true,
      court: { select: { name: true } },
    },
    orderBy: [{ bookingStart: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) return [];
  const shared = await prisma.gameExternalBooking.groupBy({
    by: ['externalBookingProvider', 'externalBookingId'],
    where: { externalBookingId: { in: rows.map((r) => r.externalBookingId) }, gameId: { not: game.id } },
    _count: { _all: true },
  });
  const otherGames = new Map(shared.map((s) => [`${s.externalBookingProvider}\u0000${s.externalBookingId}`, s._count._all]));
  return rows.map((row) => {
    const start = row.bookingStart ?? game.startTime;
    const end = row.bookingEnd ?? game.endTime;
    const place = [game.club?.name, row.court?.name].filter(Boolean).join(' · ');
    const time = `${formatAgentDateTime(start, timezone, locale)}–${formatInTimeZone(end, timezone, 'HH:mm')}`;
    return {
      gebId: row.id,
      externalBookingId: row.externalBookingId,
      provider: row.externalBookingProvider,
      label: place ? `${place} · ${time}` : time,
      otherGames: otherGames.get(`${row.externalBookingProvider}\u0000${row.externalBookingId}`) ?? 0,
    };
  });
}

async function countMoney(gameId: string): Promise<{ bets: number; shares: number }> {
  const [bets, shares] = await Promise.all([
    prisma.bet.count({ where: { gameId, status: { in: OPEN_BET_STATUSES } } }),
    prisma.gameCostShare.count({
      where: {
        gameId,
        OR: [{ markedPaidAt: { not: null } }, { confirmedAt: { not: null } }, { transactionId: { not: null } }],
      },
    }),
  ]);
  return { bets, shares };
}

/** Who `deleteGame` notifies: every non-owner on the roster, once. */
async function countNotified(gameId: string): Promise<number> {
  const rows = await prisma.gameParticipant.findMany({
    where: { gameId, role: { not: ParticipantRole.OWNER } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId)).size;
}

// --- propose paths -----------------------------------------------------------------------------

async function proposeGameOnlyCancel(
  ctx: AgentToolContext,
  args: z.infer<typeof cancelGameInput>,
  game: GameWriteRow,
  bookings: CancelGameLinkedBooking[],
  timezone: string,
): Promise<AgentToolResult> {
  const { locale } = ctx;
  const title = agentGameTitle(game);
  const [money, notified] = await Promise.all([countMoney(game.id), countNotified(game.id)]);

  const lines: AgentActionPreviewLine[] = [
    line(agentCancelGameT(locale, 'field.game'), clip(title, 60) ?? title, null),
    line(agentT(locale, 'field.club'), game.club?.name ?? agentT(locale, 'value.notSet'), null),
    line(agentT(locale, 'field.when'), when(game, timezone, locale), null),
    line(agentCancelGameT(locale, 'field.notified'), null, String(notified)),
    ...bookings.map((b) => line(agentCancelGameT(locale, 'field.booking'), b.label, null)),
  ];
  const warnings = [agentCancelGameT(locale, 'warn.deletes')];
  if (money.bets > 0 || money.shares > 0) warnings.push(agentCancelGameT(locale, 'warn.money', money));
  if (bookings.length > 0) warnings.push(agentCancelGameT(locale, 'warn.reservationsStay', { count: bookings.length }));
  for (const b of bookings) {
    if (b.otherGames > 0) warnings.push(agentCancelGameT(locale, 'warn.sharedBooking', { booking: b.label, count: b.otherGames }));
  }

  const preview: AgentActionPreview = {
    title: agentCancelGameT(locale, 'preview.title', { game: clip(title, 60) ?? title }),
    lines,
    warnings,
  };
  const plan: CancelGamePlan = {
    gameId: game.id,
    mode: 'game_only',
    externalBookingIds: bookings.map((b) => b.externalBookingId),
  };
  const result = await proposeAgentAction(ctx, { toolName: 'cancel_game', input: args, plan, preview });
  return { ...result, entities: await gameEntityFor(game.id, ctx.principal.userId) };
}

type PlannedCancel = { booking: CancelGameLinkedBooking; item: AgentBookingItem };
type StayingBooking = { booking: CancelGameLinkedBooking; reason: 'shared' | 'notBooker' | 'clubOnly' | 'notCancellable' };

/** One entry per provider booking (a multi-court booking has one link row per court). */
function uniqueBookings(bookings: CancelGameLinkedBooking[]): CancelGameLinkedBooking[] {
  const seen = new Map<string, CancelGameLinkedBooking>();
  for (const b of bookings) {
    const key = `${b.provider}\u0000${b.externalBookingId}`;
    if (!seen.has(key)) seen.set(key, b);
  }
  return [...seen.values()];
}

/**
 * Which linked bookings this principal can cancel now (booking plan §14.4): not shared with
 * another game, resolvable in the principal's own list, `canCancel` (booker, Booktime / Padeloo
 * / Klikteren, CONFIRMED, not started), the club's current provider, one provider per plan, at
 * most `AGENT_CLIENT_PLAN_MAX` bookings. The rest stay active (with a reason).
 */
async function splitLinkedBookings(
  principal: AgentPrincipal,
  game: GameWriteRow,
  bookings: CancelGameLinkedBooking[],
  now: Date,
): Promise<{ planned: PlannedCancel[]; staying: StayingBooking[] }> {
  const planned: PlannedCancel[] = [];
  const staying: StayingBooking[] = [];
  const clubId = game.clubId ?? game.court?.clubId ?? null;
  const club = clubId ? await prisma.club.findUnique({ where: { id: clubId }, select: { integrationType: true } }) : null;
  const clubProvider = club?.integrationType ?? null;
  for (const booking of uniqueBookings(bookings)) {
    if (booking.otherGames > 0) {
      staying.push({ booking, reason: 'shared' });
      continue;
    }
    if (!AGENT_CANCELLABLE_PROVIDERS.has(booking.provider) || booking.provider !== clubProvider) {
      staying.push({ booking, reason: 'clubOnly' });
      continue;
    }
    const item = await resolveBookingRef(principal, `geb:${booking.gebId}`, {}, now).catch(() => null);
    if (!item || item.externalBookingId !== booking.externalBookingId) {
      staying.push({ booking, reason: 'notCancellable' });
      continue;
    }
    if (!item.canCancel) {
      const timing = item.state !== 'CONFIRMED' || item.start.getTime() <= now.getTime();
      staying.push({ booking, reason: timing ? 'notCancellable' : 'notBooker' });
      continue;
    }
    if (planned.length >= AGENT_CLIENT_PLAN_MAX) {
      staying.push({ booking, reason: 'notCancellable' });
      continue;
    }
    planned.push({ booking, item });
  }
  return { planned, staying };
}

function stayingLabel(locale: string, s: StayingBooking): string {
  return `${s.booking.label} (${agentCancelGameT(locale, `reason.${s.reason}`)})`;
}

/**
 * Cancel the game AND its club reservations (booking plan §14.6, owner decision #3), as a
 * client-executed action (§14.5 (ii)): the app cancels every planned booking, then the post-step
 * deletes the game only if all of them were cancelled; otherwise it unlinks the cancelled ones,
 * keeps the game and returns `partial` naming the booking(s) still active. Shared bookings and
 * ones the user can't cancel are never planned: the card lists them as "stays active". When
 * nothing is cancellable, nothing is proposed and the game-only cancel is offered.
 */
async function proposeCancelWithBookings(
  ctx: AgentToolContext,
  args: z.infer<typeof cancelGameInput>,
  game: GameWriteRow,
  bookings: CancelGameLinkedBooking[],
  timezone: string,
): Promise<AgentToolResult> {
  const { locale } = ctx;
  const { planned, staying } = await splitLinkedBookings(ctx.principal, game, bookings, ctx.now);
  const handoff: AgentEntityRef = {
    type: 'handoff',
    url: gameHandoffPath(game.id),
    label: agentCancelGameT(locale, 'handoff.openGame'),
  };
  if (planned.length === 0) {
    const message = agentCancelGameT(locale, 'refuse.noneCancellable', { count: staying.length });
    return {
      data: {
        error: 'bookings_not_cancellable',
        message,
        linkedBookings: staying.length,
        reasons: staying.map((s) => s.reason),
        options: ['cancel_game with cancelBookings=false (the reservations stay active)', 'open the game in the app'],
        handoffUrl: handoff.url,
      },
      summary: agentCancelGameT(locale, 'summary.noneCancellable'),
      entities: [...(await gameEntityFor(game.id, ctx.principal.userId)), handoff],
    };
  }

  const title = agentGameTitle(game);
  const [money, notified] = await Promise.all([countMoney(game.id), countNotified(game.id)]);
  const lines: AgentActionPreviewLine[] = [
    line(agentCancelGameT(locale, 'field.game'), clip(title, 60) ?? title, null),
    line(agentT(locale, 'field.club'), game.club?.name ?? agentT(locale, 'value.notSet'), null),
    line(agentT(locale, 'field.when'), when(game, timezone, locale), null),
    line(agentCancelGameT(locale, 'field.notified'), null, String(notified)),
    ...planned.map((p) => line(agentCancelGameT(locale, 'field.bookingCancel'), p.booking.label, null)),
    ...staying.map((s) => line(agentCancelGameT(locale, 'field.bookingStays'), stayingLabel(locale, s), null)),
  ];
  const warnings = [agentCancelGameT(locale, 'warn.bookingsFirst'), agentCancelGameT(locale, 'warn.deletes')];
  if (money.bets > 0 || money.shares > 0) warnings.push(agentCancelGameT(locale, 'warn.money', money));
  if (staying.length > 0) warnings.push(agentCancelGameT(locale, 'warn.someStayActive', { count: staying.length }));
  for (const s of staying) {
    if (s.reason === 'shared') {
      warnings.push(agentCancelGameT(locale, 'warn.sharedBooking', { booking: s.booking.label, count: s.booking.otherGames }));
    }
  }

  const first = planned[0].item;
  const post: CancelGameWithBookingsPost = {
    gameId: game.id,
    bookings: planned.map((p) => toAgentCancelledBooking(p.item, p.booking.label)),
    staying: staying.map((s) => stayingLabel(locale, s).slice(0, 300)),
  };
  const result = await proposeClientExecutedAction(ctx, {
    toolName: 'cancel_game',
    input: args,
    preview: {
      title: agentCancelGameT(locale, 'preview.titleWithBookings', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    },
    clientPlan: {
      provider: first.provider,
      clubId: first.clubId,
      courts: [],
      ...clubLocalPlanTime(first),
      operation: 'cancel',
      bookings: planned.map((p) => ({
        bookingRef: p.item.ref,
        externalBookingId: p.item.externalBookingId,
        courtId: p.item.courtIds[0] ?? null,
      })),
      postStep: { kind: 'delete_game', gameId: game.id },
    },
    post,
  });
  return {
    ...result,
    data: {
      ...(result.data as Record<string, unknown>),
      bookingsToCancel: planned.length,
      bookingsStayingActive: staying.length,
      ...(supportsClientExecution(ctx)
        ? {}
        : { runsInApp: 'Only the PadelPulse app can run this: tell the user to open this chat in the app to confirm.' }),
    },
    entities: await gameEntityFor(game.id, ctx.principal.userId),
  };
}

/** Claim-time guard of the with-bookings plan: the game rules, and every planned booking still cancellable. */
async function authorizeCancelWithBookings(principal: AgentPrincipal, post: CancelGameWithBookingsPost): Promise<void> {
  await authorizeCancelGame(principal, post.gameId);
  const now = new Date();
  for (const booking of post.bookings) {
    const item = await resolveBookingRef(principal, booking.bookingRef, {}, now);
    if (item.externalBookingId !== booking.externalBookingId || item.provider !== booking.provider) {
      throw new ApiError(404, 'Booking not found');
    }
    if (!item.canCancel) throw new ApiError(403, 'This court booking can no longer be cancelled by you');
  }
}

/**
 * Post-step after the app's report (owner decision #3). Every planned booking cancelled →
 * re-run the delete guards with the fresh principal, then `deleteGame`; a guard or the delete
 * failing → EXECUTED `partial` "Bookings cancelled, game still exists". Some not cancelled →
 * unlink the cancelled ones, keep the game, `partial` naming what is still active. Mirror rows
 * of cancelled bookings → CANCELLED either way.
 */
async function cancelGameWithBookingsPostStep(ctx: AgentWriteContext, input: AgentClientPostStepInput): Promise<AgentWriteOutcome> {
  const post = parsePlan(cancelGameWithBookingsPostSchema, input.post);
  const { locale, principal } = ctx;
  const okRefs = new Set(input.succeeded.map((r) => r.bookingRef));
  const cancelled = post.bookings.filter((b) => okRefs.has(b.bookingRef));
  const notCancelled = post.bookings.filter((b) => !okRefs.has(b.bookingRef));
  for (const booking of cancelled) {
    await markMirrorBookingCancelled(principal.userId, booking, ctx.now).catch((error) =>
      console.error('[agent] mirror cancel mark failed', { error }),
    );
  }
  const cancelledRefs = cancelled.map((b) => b.bookingRef);
  const unlinkCancelled = async () => {
    for (const booking of cancelled) await unlinkCancelledBooking(principal, booking, [post.gameId]);
  };

  if (notCancelled.length === 0) {
    try {
      await authorizeCancelGame(principal, post.gameId);
      await GameDeleteService.deleteGame(post.gameId, principal.userId);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('[agent] cancel_game delete after bookings failed', { error });
      await unlinkCancelled().catch((e) => console.error('[agent] unlink after failed delete failed', { e }));
      return {
        message: agentCancelGameT(locale, 'result.deleteFailed', { count: cancelled.length }),
        partial: true,
        entities: [
          ...(await gameEntityFor(post.gameId, principal.userId).catch(() => [])),
          { type: 'handoff', url: gameHandoffPath(post.gameId), label: agentCancelGameT(locale, 'handoff.openGame') },
        ],
        modelData: { gameId: post.gameId, gameDeleted: false, bookingsCancelled: cancelledRefs, bookingsStillActive: post.staying.length },
      };
    }
    const parts = [agentCancelGameT(locale, 'result.cancelledWithBookings', { count: cancelled.length })];
    if (post.staying.length > 0) parts.push(agentCancelGameT(locale, 'result.stillActive', { bookings: post.staying.join('; ') }));
    return {
      message: parts.join(' '),
      modelData: {
        gameId: post.gameId,
        cancelled: true,
        gameDeleted: true,
        bookingsCancelled: cancelledRefs,
        ...(post.staying.length > 0 ? { reservationsStillActiveAtClub: post.staying.length } : {}),
      },
    };
  }

  await unlinkCancelled();
  const stillActive = [...notCancelled.map((b) => b.label), ...post.staying];
  return {
    message: agentCancelGameT(locale, 'result.partialKept', {
      done: cancelled.length,
      total: post.bookings.length,
      bookings: stillActive.join('; '),
    }),
    partial: true,
    entities: [
      ...(await gameEntityFor(post.gameId, principal.userId)),
      { type: 'handoff', url: gameHandoffPath(post.gameId), label: agentCancelGameT(locale, 'handoff.openGame') },
    ],
    modelData: {
      gameId: post.gameId,
      gameDeleted: false,
      gameKept: true,
      bookingsCancelled: cancelledRefs,
      bookingsNotCancelled: notCancelled.map((b) => b.bookingRef),
      reservationsStillActiveAtClub: stillActive.length,
    },
  };
}

registerAgentClientPostStep('cancel_game', cancelGameWithBookingsPostStep);

// --- tool --------------------------------------------------------------------------------------

export const cancelGameTool = defineTool({
  name: 'cancel_game',
  description:
    "Prepare cancelling (deleting) a game the user owns: every participant is notified and the game's chat is archived; open bets and paid cost shares are refunded or cancelled. cancelBookings=false cancels only the game and the court reservations at the club stay active. cancelBookings=true also cancels the reservations the user booked (Booktime / Padeloo / Klikteren, run by the app on Confirm); shared reservations and ones only the club or another person can cancel stay active, and if any planned reservation can't be cancelled the game is kept. Not possible once results exist or for a game with child games. Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint: 'cancel (delete) a game the user owns; with cancelBookings=true also its court reservations the user booked',
  input: cancelGameInput,
  label: (_args, locale) => agentCancelGameT(locale, 'label.cancelGame'),
  handler: async (ctx, args) => {
    const game = await authorizeCancelGame(ctx.principal, args.gameId);
    const timezone = gameTimezone(game, ctx.timezone);
    const bookings = await loadLinkedBookings(game, timezone, ctx.locale);
    if (args.cancelBookings && bookings.length > 0) return proposeCancelWithBookings(ctx, args, game, bookings, timezone);
    return proposeGameOnlyCancel(ctx, args, game, bookings, timezone);
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      // With bookings: client-executed (checked at claim time); the post-step re-checks before deleting.
      const client = readClientExecutedPlan(rawPlan);
      if (client) return authorizeCancelWithBookings(principal, parsePlan(cancelGameWithBookingsPostSchema, client.post));
      const plan = parsePlan(cancelGamePlanSchema, rawPlan);
      await authorizeCancelGame(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(cancelGamePlanSchema, rawPlan);
      await authorizeCancelGame(ctx.principal, plan.gameId);
      const linked = await prisma.gameExternalBooking.count({ where: { gameId: plan.gameId } });
      await GameDeleteService.deleteGame(plan.gameId, ctx.principal.userId);
      return {
        message: agentCancelGameT(ctx.locale, linked > 0 ? 'result.cancelledReservationsStay' : 'result.cancelled'),
        modelData: {
          gameId: plan.gameId,
          cancelled: true,
          ...(linked > 0 ? { reservationsAtClub: 'still active (not cancelled)', linkedBookings: linked } : {}),
        },
      };
    },
  },
});

export const CANCEL_GAME_TOOLS = [cancelGameTool];
