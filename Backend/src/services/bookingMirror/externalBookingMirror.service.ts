/**
 * App-synced booking-list mirror (AI agent booking slice 7k, docs/domains/agent.md
 * "Booking-list mirror"). The backend never calls Booktime / Padeloo / Klikteren: after the app
 * loads the user's own upcoming bookings for one provider + club, it PUTs the list here and we
 * replace the user's mirror rows for that provider + club inside the synced range.
 *
 * Trust: the same as the app's booking-link data today (`POST /games/:id/link-booking` takes the
 * provider id and times from the app). A user can only write their own rows; the worst a forged
 * payload does is make the user's own agent list wrong. Readers: `agentBookingSources.ts`.
 */
import { ClubIntegrationType, ExternalBookingMirrorState, type Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { detectUpstreamDriftFromMirror } from '../game/bookingUpstreamDrift.service';

export const MIRROR_PROVIDERS = [
  ClubIntegrationType.BOOKTIME,
  ClubIntegrationType.PADELOO,
  ClubIntegrationType.KLIKTEREN,
] as const;

export const MIRROR_MAX_BOOKINGS = 100;
export const MIRROR_MAX_COURTS = 4;
export const MIRROR_MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000;

const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const mirrorCourtSchema = z
  .object({
    courtId: z.string().trim().min(1).max(64).nullable().optional(),
    name: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

const mirrorBookingSchema = z
  .object({
    externalBookingId: z.string().trim().min(1).max(128),
    start: isoDate,
    end: isoDate,
    courts: z.array(mirrorCourtSchema).max(MIRROR_MAX_COURTS).default([]),
    state: z.enum(['CONFIRMED', 'CANCELLED']).default('CONFIRMED'),
  })
  .strict()
  .refine((b) => b.end.getTime() > b.start.getTime() && b.end.getTime() - b.start.getTime() <= MAX_BOOKING_MS, {
    message: 'end must be after start and at most 24 h later',
    path: ['end'],
  });

export const externalBookingMirrorSyncBodySchema = z
  .object({
    provider: z.enum(MIRROR_PROVIDERS),
    clubId: z.string().trim().min(1).max(64),
    rangeFrom: isoDate,
    rangeTo: isoDate,
    /** false when the app only saw a truncated page (rows are still upserted, nothing counts as covered). */
    complete: z.boolean().default(true),
    bookings: z.array(mirrorBookingSchema).max(MIRROR_MAX_BOOKINGS),
  })
  .strict()
  .refine(
    (b) => b.rangeTo.getTime() > b.rangeFrom.getTime() && b.rangeTo.getTime() - b.rangeFrom.getTime() <= MIRROR_MAX_RANGE_MS,
    { message: 'rangeTo must be after rangeFrom and at most 400 days later', path: ['rangeTo'] },
  );

export type ExternalBookingMirrorSyncBody = z.infer<typeof externalBookingMirrorSyncBodySchema>;

export type ExternalBookingMirrorSyncResult = {
  upserted: number;
  removed: number;
  syncedAt: string;
};

/**
 * Replaces `userId`'s mirror for (provider, club): upserts every booking, deletes the user's rows
 * of that provider + club starting inside [rangeFrom, rangeTo] that the list no longer has, and
 * records the sync. Court ids that are not courts of the club are dropped (the name stays).
 */
export async function syncExternalBookingMirror(
  userId: string,
  body: ExternalBookingMirrorSyncBody,
  now: Date = new Date(),
): Promise<ExternalBookingMirrorSyncResult> {
  const club = await prisma.club.findUnique({
    where: { id: body.clubId },
    select: { id: true, integrationType: true, courts: { select: { id: true } } },
  });
  if (!club) throw new ApiError(404, 'Club not found');
  if (club.integrationType !== body.provider) {
    throw new ApiError(400, 'This club has no such booking integration');
  }
  const clubCourtIds = new Set(club.courts.map((court) => court.id));

  // Last one wins for a repeated id.
  const byId = new Map(body.bookings.map((booking) => [booking.externalBookingId, booking]));
  const bookings = [...byId.values()];

  const result = await prisma.$transaction(async (tx) => {
    for (const booking of bookings) {
      const courts: Prisma.InputJsonValue = booking.courts.map((court) => ({
        courtId: court.courtId && clubCourtIds.has(court.courtId) ? court.courtId : null,
        name: court.name || null,
      }));
      const data = {
        clubId: club.id,
        courts,
        bookingStart: booking.start,
        bookingEnd: booking.end,
        state: booking.state === 'CANCELLED' ? ExternalBookingMirrorState.CANCELLED : ExternalBookingMirrorState.CONFIRMED,
        syncedAt: now,
      };
      await tx.externalBookingMirror.upsert({
        where: {
          userId_provider_externalBookingId: {
            userId,
            provider: body.provider,
            externalBookingId: booking.externalBookingId,
          },
        },
        create: { userId, provider: body.provider, externalBookingId: booking.externalBookingId, ...data },
        update: data,
      });
    }
    const removed = await tx.externalBookingMirror.deleteMany({
      where: {
        userId,
        provider: body.provider,
        clubId: club.id,
        bookingStart: { gte: body.rangeFrom, lte: body.rangeTo },
        externalBookingId: { notIn: [...byId.keys()] },
      },
    });
    const sync = { rangeFrom: body.rangeFrom, rangeTo: body.rangeTo, complete: body.complete, syncedAt: now };
    await tx.externalBookingMirrorSync.upsert({
      where: { userId_provider_clubId: { userId, provider: body.provider, clubId: club.id } },
      create: { userId, provider: body.provider, clubId: club.id, ...sync },
      update: sync,
    });
    return { upserted: bookings.length, removed: removed.count };
  });

  // Club-side drift of this user's linked bookings (docs/domains/booking.md "Club-side drift").
  // Best effort: the mirror itself is already stored.
  try {
    await detectUpstreamDriftFromMirror(
      userId,
      {
        provider: body.provider,
        clubId: club.id,
        rangeFrom: body.rangeFrom,
        rangeTo: body.rangeTo,
        complete: body.complete,
        bookings,
      },
      now,
    );
  } catch (error) {
    console.error('[BookingMirror] upstream drift detection failed', error);
  }
  return { ...result, syncedAt: now.toISOString() };
}

export type AgentBookedMirrorRow = {
  externalBookingId: string;
  start: Date;
  end: Date;
  courts: { courtId: string | null; name: string | null }[];
};

/**
 * Bookings the app just made for an agent `book_court` action (slice 7g): upserted as the
 * user's CONFIRMED mirror rows so `list_my_bookings` sees them before the next app sync. Only
 * these rows change: no range delete, no `ExternalBookingMirrorSync` coverage update.
 * Returns the mirror row ids in input order.
 */
export async function upsertAgentBookedMirrorRows(
  userId: string,
  provider: (typeof MIRROR_PROVIDERS)[number],
  clubId: string,
  bookings: AgentBookedMirrorRow[],
  now: Date = new Date(),
): Promise<string[]> {
  const ids: string[] = [];
  for (const booking of bookings) {
    const data = {
      clubId,
      courts: booking.courts as Prisma.InputJsonValue,
      bookingStart: booking.start,
      bookingEnd: booking.end,
      state: ExternalBookingMirrorState.CONFIRMED,
      syncedAt: now,
    };
    const row = await prisma.externalBookingMirror.upsert({
      where: {
        userId_provider_externalBookingId: { userId, provider, externalBookingId: booking.externalBookingId },
      },
      create: { userId, provider, externalBookingId: booking.externalBookingId, ...data },
      update: data,
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}
