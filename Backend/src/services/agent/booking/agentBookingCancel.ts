/**
 * Server side of a booking the app cancelled at the provider (slice 7g, booking plan §14.5 step 5,
 * §14.6): unlink it from the games the user may edit (`patchGameBookings {remove}`, the
 * `PATCH /games/:id/bookings` service) and mark the user's mirror row CANCELLED (slice 7k), so
 * `list_my_bookings` stops showing it. Games are never deleted here.
 */
import { ClubIntegrationType, ExternalBookingMirrorState, type Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { canMutateGameBookings } from '../../../shared/gameBooking/bookingLinkAuthorization';
import { patchGameBookings } from '../../game/gameExternalBooking.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { formatAgentDateTime } from '../i18n/agentI18n';
import type { AgentBookingItem } from './agentBookingSources';

/** What a post-step needs about one planned cancellation (server-resolved at propose time). */
export const agentCancelledBookingSchema = z
  .object({
    bookingRef: z.string().min(1).max(128),
    externalBookingId: z.string().min(1).max(128),
    provider: z.enum([ClubIntegrationType.BOOKTIME, ClubIntegrationType.PADELOO, ClubIntegrationType.KLIKTEREN]),
    clubId: z.string().min(1).max(128),
    start: z.string(),
    end: z.string(),
    courtIds: z.array(z.string()).max(8),
    courtNames: z.array(z.string()).max(8),
    /** Localized one-line label (club · court · time) for result messages. */
    label: z.string().max(300),
  })
  .strict();
export type AgentCancelledBooking = z.infer<typeof agentCancelledBookingSchema>;

export function toAgentCancelledBooking(item: AgentBookingItem, label: string): AgentCancelledBooking {
  return {
    bookingRef: item.ref,
    externalBookingId: item.externalBookingId,
    provider: item.provider as AgentCancelledBooking['provider'],
    clubId: item.clubId,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    courtIds: item.courtIds.slice(0, 8),
    courtNames: item.courtNames.slice(0, 8),
    label: label.slice(0, 300),
  };
}

/** Games (distinct, stable order) a provider booking is linked to, over every user. */
export async function gamesLinkedToBooking(
  provider: ClubIntegrationType,
  externalBookingId: string,
): Promise<string[]> {
  const rows = await prisma.gameExternalBooking.findMany({
    where: { externalBookingProvider: provider, externalBookingId },
    select: { gameId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return [...new Set(rows.map((r) => r.gameId))];
}

export type AgentUnlinkOutcome = { unlinked: string[]; skipped: string[] };

/**
 * Removes a cancelled booking from its linked games, only where the principal may change the
 * game's bookings (the HTTP rule); the rest are `skipped` (the caller says so).
 * `onlyGameIds` limits it to those games.
 */
export async function unlinkCancelledBooking(
  principal: Pick<AgentPrincipal, 'userId' | 'isAdmin'>,
  booking: Pick<AgentCancelledBooking, 'provider' | 'externalBookingId'>,
  onlyGameIds?: readonly string[],
): Promise<AgentUnlinkOutcome> {
  const all = await gamesLinkedToBooking(booking.provider, booking.externalBookingId);
  const gameIds = onlyGameIds ? all.filter((id) => onlyGameIds.includes(id)) : all;
  const out: AgentUnlinkOutcome = { unlinked: [], skipped: [] };
  for (const gameId of gameIds) {
    if (!(await canMutateGameBookings(gameId, principal.userId, principal.isAdmin))) {
      out.skipped.push(gameId);
      continue;
    }
    try {
      await patchGameBookings(gameId, principal.userId, principal.isAdmin, { remove: [booking.externalBookingId] });
      out.unlinked.push(gameId);
    } catch (error) {
      console.error('[agent] unlink of a cancelled booking failed', { gameId, error });
      out.skipped.push(gameId);
    }
  }
  return out;
}

/** The principal's mirror row of the booking → CANCELLED (created when the app never synced it). */
export async function markMirrorBookingCancelled(userId: string, booking: AgentCancelledBooking, now: Date): Promise<void> {
  const courts: Prisma.InputJsonValue = booking.courtNames.map((name, i) => ({ courtId: booking.courtIds[i] ?? null, name }));
  await prisma.externalBookingMirror.upsert({
    where: {
      userId_provider_externalBookingId: {
        userId,
        provider: booking.provider,
        externalBookingId: booking.externalBookingId,
      },
    },
    update: { state: ExternalBookingMirrorState.CANCELLED },
    create: {
      userId,
      provider: booking.provider,
      clubId: booking.clubId,
      externalBookingId: booking.externalBookingId,
      courts,
      bookingStart: new Date(booking.start),
      bookingEnd: new Date(booking.end),
      state: ExternalBookingMirrorState.CANCELLED,
      syncedAt: now,
    },
  });
}

/** Club-local plan fields (`AgentClientPlan.date` / `start` / `durationMinutes`) of a booking. */
export function clubLocalPlanTime(item: Pick<AgentBookingItem, 'start' | 'end' | 'timeZone'>): {
  date: string;
  start: string;
  durationMinutes: number;
} {
  const minutes = Math.round((item.end.getTime() - item.start.getTime()) / 60000);
  return {
    date: formatInTimeZone(item.start, item.timeZone, 'yyyy-MM-dd'),
    start: formatInTimeZone(item.start, item.timeZone, 'HH:mm'),
    durationMinutes: Math.min(24 * 60, Math.max(15, minutes)),
  };
}

/** "Club · Court 1 · Mon 5 Oct 18:00–19:30" in the club's timezone. */
export function agentBookingLabel(
  item: Pick<AgentBookingItem, 'clubName' | 'courtNames' | 'start' | 'end' | 'timeZone'>,
  locale: string,
): string {
  const courts = item.courtNames.length > 0 ? ` · ${item.courtNames.join(', ')}` : '';
  return `${item.clubName}${courts} · ${agentBookingTimeLabel(item, locale)}`;
}

/** "Mon 5 Oct 18:00–19:30" in the club's timezone. */
export function agentBookingTimeLabel(item: Pick<AgentBookingItem, 'start' | 'end' | 'timeZone'>, locale: string): string {
  return `${formatAgentDateTime(item.start, item.timeZone, locale)}–${formatInTimeZone(item.end, item.timeZone, 'HH:mm')}`;
}
