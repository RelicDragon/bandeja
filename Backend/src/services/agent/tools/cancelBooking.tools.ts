/**
 * `cancel_booking {bookingRef}` (booking slice 7g).
 * Critical, client-executed (§14.5 (ii)): the app cancels at Booktime / Padeloo / Klikteren on
 * the user's phone; the server never calls those providers.
 *
 * Guards (propose AND claim, fresh principal at claim):
 *   1. `resolveBookingRef` inside the principal's own list (another user's / malformed → 404);
 *   2. the provider can cancel (Booktime / Padeloo / Klikteren) and is still the club's
 *      integration; Weltner / Nspadel (and anything else) → refusal "only the club can cancel"
 *      + the club's phone when stored + a `/clubs/:id` handoff (propose), 400 at claim;
 *   3. CONFIRMED and not started (CANCELLED / UNKNOWN / started → 400);
 *   4. `canCancel`: the principal is the booker (legacy rows: owner/admin + connection) → else 403.
 * The provider's own cancel window is enforced by the app adapter (the server doesn't know it).
 *
 * The plan (provider, club, provider booking id) comes from the server row, never from the
 * model. Post-step (after the app's report): unlink the booking from every linked game the user
 * may edit (`patchGameBookings {remove}`, as `PATCH /games/:id/bookings`; others are skipped and
 * named in the result), mark the user's mirror row CANCELLED. Linked games are never deleted.
 */
import { ClubIntegrationType } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { canMutateGameBookings } from '../../../shared/gameBooking/bookingLinkAuthorization';
import type { AgentPrincipal } from '../access/agentPrincipal';
import {
  agentBookingLabel,
  agentBookingTimeLabel,
  agentCancelledBookingSchema,
  clubLocalPlanTime,
  gamesLinkedToBooking,
  markMirrorBookingCancelled,
  toAgentCancelledBooking,
  unlinkCancelledBooking,
} from '../booking/agentBookingCancel';
import {
  AGENT_CANCELLABLE_PROVIDERS,
  resolveBookingRef,
  type AgentBookingItem,
} from '../booking/agentBookingSources';
import { supportsClientExecution } from '../clientExecution/clientCaps';
import { proposeClientExecutedAction, readClientExecutedPlan } from '../clientExecution/clientPlan';
import { registerAgentClientPostStep } from '../clientExecution/clientPostSteps';
import { agentBookingEntity } from '../dto/booking.dto';
import { agentGameTitle } from '../dto/game.dto';
import { agentBookingT } from '../i18n/agentBookingI18n';
import { agentCancelBookingT } from '../i18n/agentCancelBookingI18n';
import { agentT } from '../i18n/agentI18n';
import { defineTool, type AgentToolResult } from './registry';
import { clip, gameEntityFor, line, parsePlan } from './writeHelpers';

const TOOL = 'cancel_booking';

export const CLIENT_PROVIDER_LABEL: Partial<Record<ClubIntegrationType, string>> = {
  BOOKTIME: 'Booktime',
  PADELOO: 'Padeloo',
  KLIKTEREN: 'Klikteren',
};

const cancelBookingInput = z
  .object({
    bookingRef: z
      .string()
      .min(1)
      .max(80)
      .describe('bookingRef from list_my_bookings or a [booking:…] token; never a provider booking id'),
  })
  .strict();

const cancelBookingPostSchema = z.object({ booking: agentCancelledBookingSchema }).strict();

type CancelClub = { id: string; name: string; phone: string | null; integrationType: ClubIntegrationType | null };

/** Why only the club can cancel it (Weltner / Nspadel, or the club changed provider). */
function clubOnly(item: AgentBookingItem, club: CancelClub): boolean {
  return !AGENT_CANCELLABLE_PROVIDERS.has(item.provider) || club.integrationType !== item.provider;
}

function clubOnlyMessage(club: CancelClub, locale: string): string {
  const phone = club.phone?.trim();
  return phone
    ? agentCancelBookingT(locale, 'refuse.cancelViaClubPhone', { club: club.name, phone })
    : agentCancelBookingT(locale, 'refuse.cancelViaClub', { club: club.name });
}

/** State, time and booker checks (after the provider check). */
function assertCancellable(item: AgentBookingItem, now: Date, locale: string): void {
  if (item.state === 'CANCELLED') throw new ApiError(400, agentCancelBookingT(locale, 'error.alreadyCancelled'));
  if (item.state === 'UNKNOWN') throw new ApiError(400, agentCancelBookingT(locale, 'error.unknownState'));
  if (item.state === 'PAST' || item.start.getTime() <= now.getTime()) {
    throw new ApiError(400, agentCancelBookingT(locale, 'error.started'));
  }
  if (!item.canCancel) throw new ApiError(403, agentCancelBookingT(locale, 'error.notBooker'));
}

async function loadClub(clubId: string): Promise<CancelClub> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, name: true, phone: true, integrationType: true },
  });
  if (!club) throw new ApiError(404, 'Booking not found');
  return club;
}

/** Claim-time guard: the same booking, still cancellable by this principal. */
async function authorizeCancelBooking(principal: AgentPrincipal, rawPlan: unknown, locale: string): Promise<void> {
  const client = readClientExecutedPlan(rawPlan);
  if (!client) throw new ApiError(400, 'Invalid plan');
  const { booking } = parsePlan(cancelBookingPostSchema, client.post);
  const now = new Date();
  const item = await resolveBookingRef(principal, booking.bookingRef, {}, now);
  if (item.externalBookingId !== booking.externalBookingId || item.provider !== booking.provider) {
    throw new ApiError(404, 'Booking not found');
  }
  const club = await loadClub(item.clubId);
  if (clubOnly(item, club)) throw new ApiError(400, clubOnlyMessage(club, locale));
  assertCancellable(item, now, locale);
}

export const cancelBookingTool = defineTool({
  name: TOOL,
  description:
    "Prepare cancelling one of the user's court bookings at the club (bookingRef from list_my_bookings or a [booking:…] token). Only the person who booked it can cancel; Booktime, Padeloo and Klikteren bookings are cancelled by the app on the user's phone after Confirm. Weltner / NS Padel bookings can only be cancelled by the club (the tool says how). Linked games are NOT cancelled: the booking is only removed from them. Creates a confirmation card; nothing changes until the user confirms in the app.",
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint: 'cancel a court booking at the club (the user must be its booker; linked games stay, they only lose the court)',
  input: cancelBookingInput,
  label: (_args, locale) => agentCancelBookingT(locale, 'label.cancelBooking'),
  handler: async (ctx, args): Promise<AgentToolResult> => {
    const { principal, locale } = ctx;
    const item = await resolveBookingRef(principal, args.bookingRef, {}, ctx.now);
    const club = await loadClub(item.clubId);
    if (clubOnly(item, club)) {
      const message = clubOnlyMessage(club, locale);
      const handoff: AgentEntityRef = {
        type: 'handoff',
        url: `/clubs/${club.id}`,
        label: agentCancelBookingT(locale, 'handoff.openClub'),
      };
      return {
        data: {
          error: 'not_available',
          reason: 'cancel_via_club',
          message,
          clubPhone: club.phone?.trim() || null,
          nothingCancelled: true,
          handoffUrl: handoff.url,
        },
        summary: message,
        entities: [agentBookingEntity(item), handoff],
      };
    }
    assertCancellable(item, ctx.now, locale);

    // Every game the booking is linked to (any owner); names only for games the user sees.
    const allGameIds = await gamesLinkedToBooking(item.provider, item.externalBookingId);
    const visible = new Set(item.linkedGameIds);
    const editable: string[] = [];
    const staying: string[] = [];
    for (const gameId of allGameIds) {
      if (await canMutateGameBookings(gameId, principal.userId, principal.isAdmin)) editable.push(gameId);
      else staying.push(gameId);
    }
    const games = await prisma.game.findMany({
      where: { id: { in: allGameIds.filter((id) => visible.has(id)) } },
      select: { id: true, name: true, entityType: true, club: { select: { name: true } } },
    });
    const titles = new Map(games.map((g) => [g.id, clip(agentGameTitle(g), 60) ?? agentGameTitle(g)]));

    const label = agentBookingLabel(item, locale);
    const lines: AgentActionPreviewLine[] = [
      line(agentT(locale, 'field.club'), item.clubName, null),
      ...(item.courtNames.length ? [line(agentBookingT(locale, 'field.courts'), item.courtNames.join(', '), null)] : []),
      line(agentT(locale, 'field.when'), agentBookingT(locale, 'value.clubTime', { time: agentBookingTimeLabel(item, locale), zone: item.timeZone }), null),
      line(agentBookingT(locale, 'field.provider'), CLIENT_PROVIDER_LABEL[item.provider] ?? item.provider, null),
      ...editable.filter((id) => titles.has(id)).map((id) => line(agentCancelBookingT(locale, 'field.unlinkFrom'), titles.get(id)!, null)),
      ...staying.filter((id) => titles.has(id)).map((id) => line(agentCancelBookingT(locale, 'field.staysLinked'), titles.get(id)!, null)),
    ];
    const warnings = [agentCancelBookingT(locale, 'warn.cancelsAtClub')];
    if (allGameIds.length > 0) warnings.push(agentCancelBookingT(locale, 'warn.gamesKept'));
    if (allGameIds.length > 1) warnings.push(agentCancelBookingT(locale, 'warn.shared', { count: allGameIds.length }));
    if (staying.length > 0) warnings.push(agentCancelBookingT(locale, 'warn.staysLinked', { count: staying.length }));

    const preview: AgentActionPreview = {
      title: agentCancelBookingT(locale, 'preview.title', { club: item.clubName }),
      lines,
      warnings,
    };
    const result = await proposeClientExecutedAction(ctx, {
      toolName: TOOL,
      input: args,
      preview,
      clientPlan: {
        provider: item.provider,
        clubId: item.clubId,
        courts: [],
        ...clubLocalPlanTime(item),
        operation: 'cancel',
        bookings: [{ bookingRef: item.ref, externalBookingId: item.externalBookingId, courtId: item.courtIds[0] ?? null }],
        postStep: { kind: editable.length > 0 ? 'unlink_game' : 'none', gameId: editable[0] ?? null },
      },
      post: { booking: toAgentCancelledBooking(item, label) },
    });
    return {
      ...result,
      data: {
        ...(result.data as Record<string, unknown>),
        linkedGames: allGameIds.length,
        gamesKept: true,
        ...(supportsClientExecution(ctx)
          ? {}
          : { runsInApp: 'Only the PadelPulse app can run this: tell the user to open this chat in the app to confirm.' }),
      },
      entities: [agentBookingEntity(item)],
    };
  },
  confirm: {
    authorize: async (principal, rawPlan) => authorizeCancelBooking(principal, rawPlan, principal.language ?? 'en'),
    execute: async () => {
      // Client-executed: `/confirm` answers 409 CLIENT_EXECUTION_REQUIRED before this.
      throw new ApiError(409, 'Open the app to confirm this change', true, { code: 'CLIENT_EXECUTION_REQUIRED' });
    },
  },
});

registerAgentClientPostStep(TOOL, async (ctx, input) => {
  const { booking } = parsePlan(cancelBookingPostSchema, input.post);
  const unlink = await unlinkCancelledBooking(ctx.principal, booking);
  await markMirrorBookingCancelled(ctx.principal.userId, booking, ctx.now);
  const parts = [
    unlink.unlinked.length > 0
      ? agentCancelBookingT(ctx.locale, 'result.cancelledUnlinked', { count: unlink.unlinked.length })
      : agentCancelBookingT(ctx.locale, 'result.cancelled'),
  ];
  if (unlink.skipped.length > 0) parts.push(agentCancelBookingT(ctx.locale, 'result.staysLinked', { count: unlink.skipped.length }));
  const entities: AgentEntityRef[] = [];
  for (const gameId of unlink.unlinked) entities.push(...(await gameEntityFor(gameId, ctx.principal.userId)));
  return {
    message: parts.join(' '),
    entities,
    modelData: {
      bookingRef: booking.bookingRef,
      cancelledAtClub: true,
      removedFromGameIds: unlink.unlinked,
      stillLinkedToGamesUserCannotEdit: unlink.skipped.length,
      gamesDeleted: false,
    },
  };
});

export const CANCEL_BOOKING_TOOLS = [cancelBookingTool];
