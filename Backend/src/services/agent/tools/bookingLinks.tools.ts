/**
 * Booking ↔ game link tools (phase 7c):
 * `link_booking_to_game`, `unlink_booking`. Both are standard-risk writes.
 *
 * Guards (propose AND confirm, fresh principal at confirm):
 *   1. the game is visible to the agent (hidden → the same 404 as a missing game);
 *   2. `canMutateGameBookings` — the HTTP rule (game OWNER / ADMIN, or the parent game's);
 *   3. `bookingRef` resolves inside the principal's own booking list (`resolveBookingRef`,
 *      incl. the app-synced `mirror:` rows; another user's ref, a malformed ref → 404).
 * Link also requires: the booking is at the game's club, it is not already linked to that game,
 * and (Weltner) the receipt is the principal's. Unlink requires the booking to be linked to that
 * game and never touches the provider: the reservation at the club stays active.
 *
 * The model only passes `{bookingRef, gameId}`. Provider id, court and times come from the
 * server's booking row (`AgentBookingItem`), re-resolved at execute time, and go through the
 * same services as `POST /games/:id/link-booking` and `PATCH /games/:id/bookings`.
 */
import { ClubIntegrationType } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import { assertGameNeedsCourts } from '../booking/gameCourtNeed';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { canMutateGameBookings } from '../../../shared/gameBooking/bookingLinkAuthorization';
import { deriveGameTimeFromBookings } from '../../../shared/gameBooking/deriveGameTimeFromBookings';
import { linkBookingToGame, patchGameBookings } from '../../game/gameExternalBooking.service';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { proposeAgentAction } from '../agentActionPropose';
import { resolveBookingRef, type AgentBookingItem } from '../booking/agentBookingSources';
import { agentBookingEntity } from '../dto/booking.dto';
import { agentGameTitle } from '../dto/game.dto';
import { agentBookingT } from '../i18n/agentBookingI18n';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import { defineTool } from './registry';
import { clip, gameEntityFor, gameTimezone, line, loadGameForWrite, parsePlan, type GameWriteRow } from './writeHelpers';

const ID = z.string().min(1).max(64);
const BOOKING_REF = z
  .string()
  .min(1)
  .max(80)
  .describe('bookingRef from list_my_bookings (e.g. geb:…, weltner:… or mirror:…); never a provider booking id');

const bookingLinkInput = z.object({ bookingRef: BOOKING_REF, gameId: ID }).strict();

const bookingLinkPlanSchema = z
  .object({
    gameId: z.string(),
    bookingRef: z.string(),
    /** Server-resolved at propose time; execute refuses if the ref now points elsewhere. */
    externalBookingId: z.string(),
  })
  .strict();
type BookingLinkPlan = z.infer<typeof bookingLinkPlanSchema>;

// --- shared guards ---------------------------------------------------------------------------

/** Visibility (404) → HTTP booking-link rule (403) → the principal's own booking (404). */
async function authorizeBookingLink(
  principal: AgentPrincipal,
  gameId: string,
  bookingRef: string,
  now: Date,
): Promise<AgentBookingItem> {
  await assertAgentCanViewGame(principal, gameId);
  if (!(await canMutateGameBookings(gameId, principal.userId, principal.isAdmin))) {
    throw new ApiError(403, 'Only the owner or an admin of this game can change its court bookings');
  }
  // `mirror:` refs (app-synced list, slice 7k) resolve like the others: provider id, court and
  // times come from the principal's own mirror row, never from the model.
  return resolveBookingRef(principal, bookingRef, {}, now);
}

function gameClubId(game: Pick<GameWriteRow, 'clubId' | 'court'>): string | null {
  return game.clubId ?? game.court?.clubId ?? null;
}

async function assertLinkable(item: AgentBookingItem, game: GameWriteRow): Promise<void> {
  if (item.state === 'UNKNOWN' || item.state === 'CANCELLED') {
    throw new ApiError(400, 'This booking is not confirmed, so it cannot be linked to a game');
  }
  if (item.provider === ClubIntegrationType.WELTNER && item.source !== 'weltner') {
    throw new ApiError(400, 'Only the person who booked this court can link it to another game');
  }
  const clubId = gameClubId(game);
  if (!clubId) {
    throw new ApiError(400, 'This game has no club yet; set the club first, then link the booking');
  }
  if (clubId !== item.clubId) {
    throw new ApiError(400, "This booking is at a different club than the game; a game can only link bookings at its own club");
  }
  const linked = await prisma.gameExternalBooking.findFirst({
    where: { gameId: game.id, externalBookingId: item.externalBookingId },
    select: { id: true },
  });
  if (linked || item.linkedGameIds.includes(game.id)) {
    throw new ApiError(400, 'This booking is already linked to that game');
  }
  await assertGameNeedsCourts(game, item.courtIds, item.start, item.end);
}

async function assertLinkedToGame(item: AgentBookingItem, gameId: string): Promise<void> {
  const linked = await prisma.gameExternalBooking.findFirst({
    where: { gameId, externalBookingId: item.externalBookingId },
    select: { id: true },
  });
  if (!linked) throw new ApiError(400, 'This booking is not linked to that game');
}

// --- preview helpers ---------------------------------------------------------------------------

function bookingLabel(item: AgentBookingItem, locale: string): string {
  const courts = item.courtNames.length > 0 ? ` · ${item.courtNames.join(', ')}` : '';
  const time = `${formatAgentDateTime(item.start, item.timeZone, locale)}–${formatInTimeZone(item.end, item.timeZone, 'HH:mm')}`;
  return `${item.clubName}${courts} · ${time}`;
}

/** The game's times after the link change, as `syncGameBookingState` will derive them (null = unchanged). */
async function nextGameTimes(
  gameId: string,
  change: { add?: AgentBookingItem; removeExternalBookingId?: string },
): Promise<{ startTime: Date; endTime: Date } | null> {
  const [game, rows] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId }, select: { timeOverride: true } }),
    prisma.gameExternalBooking.findMany({
      where: { gameId },
      select: { externalBookingId: true, bookingStart: true, bookingEnd: true },
    }),
  ]);
  if (!game || game.timeOverride) return null;
  const kept = rows
    .filter((row) => row.externalBookingId !== change.removeExternalBookingId)
    .map((row) => ({ bookingStart: row.bookingStart?.toISOString() ?? null, bookingEnd: row.bookingEnd?.toISOString() ?? null }));
  if (change.add) kept.push({ bookingStart: change.add.start.toISOString(), bookingEnd: change.add.end.toISOString() });
  if (kept.length === 0) return null;
  const derived = deriveGameTimeFromBookings(kept);
  if (!derived.startTime || !derived.endTime) return null;
  return { startTime: new Date(derived.startTime), endTime: new Date(derived.endTime) };
}

function gameTimeLines(
  game: GameWriteRow,
  next: { startTime: Date; endTime: Date } | null,
  timezone: string,
  locale: string,
): AgentActionPreviewLine[] {
  if (!next) return [];
  const lines: AgentActionPreviewLine[] = [];
  const from = (date: Date) => (game.timeIsSet ? formatAgentDateTime(date, timezone, locale) : agentT(locale, 'value.notSet'));
  if (!game.timeIsSet || next.startTime.getTime() !== game.startTime.getTime()) {
    lines.push(line(agentT(locale, 'field.start'), from(game.startTime), formatAgentDateTime(next.startTime, timezone, locale)));
  }
  if (!game.timeIsSet || next.endTime.getTime() !== game.endTime.getTime()) {
    lines.push(line(agentT(locale, 'field.end'), from(game.endTime), formatAgentDateTime(next.endTime, timezone, locale)));
  }
  return lines;
}

async function entitiesFor(item: AgentBookingItem, gameId: string, viewerId: string): Promise<AgentEntityRef[]> {
  return [agentBookingEntity(item), ...(await gameEntityFor(gameId, viewerId))];
}

// --- link_booking_to_game ----------------------------------------------------------------------

export const linkBookingToGameTool = defineTool({
  name: 'link_booking_to_game',
  description:
    "Prepare linking one of the user's court bookings (bookingRef from list_my_bookings) to a game they organise (owner or admin) at the same club. The game's time follows the booking unless its time is fixed. Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: "link one of the user's court bookings to a game they organise at the same club",
  input: bookingLinkInput,
  label: (_args, locale) => agentBookingT(locale, 'label.linkBooking'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    const item = await authorizeBookingLink(principal, args.gameId, args.bookingRef, ctx.now);
    const game = await loadGameForWrite(args.gameId);
    await assertLinkable(item, game);

    const timezone = gameTimezone(game, item.timeZone);
    const lines = [
      line(agentBookingT(locale, 'field.booking'), null, bookingLabel(item, locale)),
      ...gameTimeLines(game, await nextGameTimes(game.id, { add: item }), timezone, locale),
    ];
    const warnings: string[] = [];
    const others = item.linkedGameIds.length;
    if (others > 0) warnings.push(agentBookingT(locale, 'warn.alsoLinked', { count: others }));
    if (item.state === 'PAST') warnings.push(agentBookingT(locale, 'warn.pastBooking'));

    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentBookingT(locale, 'preview.link.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    const plan: BookingLinkPlan = { gameId: game.id, bookingRef: item.ref, externalBookingId: item.externalBookingId };
    const result = await proposeAgentAction(ctx, { toolName: 'link_booking_to_game', input: args, plan, preview });
    return { ...result, entities: await entitiesFor(item, game.id, principal.userId) };
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(bookingLinkPlanSchema, rawPlan);
      const item = await authorizeBookingLink(principal, plan.gameId, plan.bookingRef, new Date());
      if (item.externalBookingId !== plan.externalBookingId) throw new ApiError(404, 'Booking not found');
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(bookingLinkPlanSchema, rawPlan);
      // Fresh server row: provider id, court and times never come from the model or a stale plan.
      const item = await authorizeBookingLink(ctx.principal, plan.gameId, plan.bookingRef, ctx.now);
      if (item.externalBookingId !== plan.externalBookingId) throw new ApiError(404, 'Booking not found');
      await assertLinkable(item, await loadGameForWrite(plan.gameId));
      await linkBookingToGame(plan.gameId, ctx.principal.userId, ctx.principal.isAdmin, {
        externalBookingId: item.externalBookingId,
        snapshot: {
          externalBookingId: item.externalBookingId,
          ...(item.courtIds[0] ? { courtId: item.courtIds[0] } : {}),
          bookingStart: item.start.toISOString(),
          bookingEnd: item.end.toISOString(),
        },
      });
      const after = await resolveBookingRef(ctx.principal, plan.bookingRef, {}, ctx.now).catch(() => item);
      return {
        message: agentBookingT(ctx.locale, 'result.linked'),
        entities: await entitiesFor(after, plan.gameId, ctx.principal.userId),
        modelData: {
          gameId: plan.gameId,
          bookingRef: after.ref,
          linkedGameIds: after.linkedGameIds,
          start: item.start.toISOString(),
          end: item.end.toISOString(),
        },
      };
    },
  },
});

// --- unlink_booking ----------------------------------------------------------------------------

export const unlinkBookingTool = defineTool({
  name: 'unlink_booking',
  description:
    'Prepare removing a court booking (bookingRef from list_my_bookings) from a game the user organises (owner or admin). This does NOT cancel the reservation at the club; it only removes the link. Creates a confirmation card; nothing changes until the user confirms.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'remove a court booking from a game the user organises (the reservation at the club stays active)',
  input: bookingLinkInput,
  label: (_args, locale) => agentBookingT(locale, 'label.unlinkBooking'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    const item = await authorizeBookingLink(principal, args.gameId, args.bookingRef, ctx.now);
    await assertLinkedToGame(item, args.gameId);
    const game = await loadGameForWrite(args.gameId);

    const timezone = gameTimezone(game, item.timeZone);
    const lines = [
      line(agentBookingT(locale, 'field.booking'), bookingLabel(item, locale), null),
      ...gameTimeLines(game, await nextGameTimes(game.id, { removeExternalBookingId: item.externalBookingId }), timezone, locale),
    ];
    const warnings = [agentBookingT(locale, 'warn.reservationStays')];
    const remaining = await prisma.gameExternalBooking.count({
      where: { gameId: game.id, externalBookingId: { not: item.externalBookingId } },
    });
    if (remaining === 0) warnings.push(agentBookingT(locale, 'warn.noBookedCourtLeft'));

    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentBookingT(locale, 'preview.unlink.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    const plan: BookingLinkPlan = { gameId: game.id, bookingRef: item.ref, externalBookingId: item.externalBookingId };
    const result = await proposeAgentAction(ctx, { toolName: 'unlink_booking', input: args, plan, preview });
    return { ...result, entities: await entitiesFor(item, game.id, principal.userId) };
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(bookingLinkPlanSchema, rawPlan);
      const item = await authorizeBookingLink(principal, plan.gameId, plan.bookingRef, new Date());
      if (item.externalBookingId !== plan.externalBookingId) throw new ApiError(404, 'Booking not found');
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(bookingLinkPlanSchema, rawPlan);
      const item = await authorizeBookingLink(ctx.principal, plan.gameId, plan.bookingRef, ctx.now);
      if (item.externalBookingId !== plan.externalBookingId) throw new ApiError(404, 'Booking not found');
      await assertLinkedToGame(item, plan.gameId);
      await patchGameBookings(plan.gameId, ctx.principal.userId, ctx.principal.isAdmin, {
        remove: [item.externalBookingId],
      });
      // The booking may have left the principal's list (it was only linked to this game).
      const after = await resolveBookingRef(ctx.principal, plan.bookingRef, {}, ctx.now).catch(() => null);
      return {
        message: agentBookingT(ctx.locale, 'result.unlinked'),
        entities: after
          ? await entitiesFor(after, plan.gameId, ctx.principal.userId)
          : await gameEntityFor(plan.gameId, ctx.principal.userId),
        modelData: {
          gameId: plan.gameId,
          bookingRef: plan.bookingRef,
          linkedGameIds: after?.linkedGameIds ?? [],
          reservationAtClub: 'still active (not cancelled)',
        },
      };
    },
  },
});

export const BOOKING_LINK_TOOLS = [linkBookingToGameTool, unlinkBookingTool];
