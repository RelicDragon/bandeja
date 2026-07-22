import type { Sport } from '@shared/sport';
import type { Club } from '@/types';
import type { KlikterenClient } from './client';
import { booktimeIsoToUtcIso } from '@/integrations/booktime/localTime';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import {
  buildKlikterenEndTime,
  isSnapshotOlderThan,
  slotFitsAvailableSlots,
  freeStartTimesToDurationSlots,
  type KlikterenBookingDuration,
  KLIKTEREN_CONFIRM_RECHECK_MS,
} from './slots';
import { getKlikterenExternalUserId } from './session';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { unlinkBookingFromLinkedGames, fetchLinkedGameIdsForBooking } from '@/services/gameBooking/unlinkBookingFromLinkedGames';

export type KlikterenPendingBooking = {
  clubId: string;
  klikterenVenueId: string;
  courtId: string;
  externalCourtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: KlikterenBookingDuration;
  sport?: Sport | null;
};

export type KlikterenBookFlowContext = {
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  lastFetchedAt: string | null;
};

export class KlikterenSlotTakenError extends Error {
  constructor(message: string = BOOKING_ERROR_KEYS.slotNoLongerAvailable) {
    super(message);
    this.name = 'KlikterenSlotTakenError';
  }
}

export async function isKlikterenSlotStillFree(
  client: KlikterenClient,
  pending: KlikterenPendingBooking,
): Promise<boolean> {
  const availability = await client.getAvailability(pending.klikterenVenueId, pending.dateKey);
  const freeStarts = availability.courtFreeSlots?.[pending.externalCourtId] ?? [];
  const slots = freeStartTimesToDurationSlots(freeStarts, pending.durationMinutes);

  const [sh, sm] = pending.startTime.split(':').map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + pending.durationMinutes;

  return slotFitsAvailableSlots(slotStartMin, slotEndMin, slots);
}

export function isKlikterenSlotTakenError(err: unknown): boolean {
  if (err instanceof KlikterenSlotTakenError) return true;
  const status =
    err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
  if (status === 409) return true;
  const data =
    err && typeof err === 'object' && 'data' in err ? (err as { data: unknown }).data : null;
  const code =
    data && typeof data === 'object' && data !== null && 'errorCode' in data
      ? String((data as { errorCode: unknown }).errorCode)
      : '';
  return /slot|taken|booked|conflict|unavailable/i.test(code);
}

export async function confirmKlikterenBooking(
  client: KlikterenClient,
  club: Club,
  klikterenVenueId: string,
  pending: KlikterenPendingBooking,
  ctx: KlikterenBookFlowContext,
): Promise<{ bookingId: string; bookingStart: string; bookingEnd: string; price?: number }> {
  if (isSnapshotOlderThan(ctx.lastFetchedAt, KLIKTEREN_CONFIRM_RECHECK_MS)) {
    await ctx.refreshSnapshot();
  }

  const stillFree = await isKlikterenSlotStillFree(client, pending);
  if (!stillFree) {
    await ctx.refreshSnapshot({ force: true });
    throw new KlikterenSlotTakenError();
  }

  const externalUserId = getKlikterenExternalUserId(club.id);
  if (!externalUserId) throw new Error(BOOKING_ERROR_KEYS.sessionExpired);

  const endTime = buildKlikterenEndTime(pending.startTime, pending.durationMinutes);

  let booking;
  try {
    booking = await client.createBooking({
      courtId: pending.externalCourtId,
      date: pending.dateKey,
      startTime: pending.startTime,
      endTime,
    });
  } catch (err) {
    if (isKlikterenSlotTakenError(err)) {
      await ctx.refreshSnapshot({ force: true });
      throw new KlikterenSlotTakenError(BOOKING_ERROR_KEYS.slotNoLongerAvailable);
    }
    throw err;
  }

  await ctx.refreshSnapshot({ force: true });

  const clubTimezone = getClubTimezone(club);
  const bookingStartLocal = `${pending.dateKey}T${pending.startTime}`;
  const bookingEndLocal = `${pending.dateKey}T${booking.endTime ?? endTime}`;

  return {
    bookingId: String(booking.id),
    bookingStart: booktimeIsoToUtcIso(bookingStartLocal, clubTimezone) ?? bookingStartLocal,
    bookingEnd: booktimeIsoToUtcIso(bookingEndLocal, clubTimezone) ?? bookingEndLocal,
    price: booking.price,
  };
}

export function canCancelKlikterenByPolicy(
  bookingStart: string,
  cancellationHours: number,
): boolean {
  const start = new Date(bookingStart);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() >= cancellationHours * 60 * 60 * 1000;
}

export async function cancelKlikterenBooking(
  client: KlikterenClient,
  bookingId: string,
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>,
): Promise<void> {
  const linkedGameIds = await fetchLinkedGameIdsForBooking(bookingId).catch((error) => {
    console.error('Failed to resolve linked games before booking cancel', { bookingId, error });
    return [];
  });

  await client.cancelBooking(bookingId);

  const { invalidateKlikterenUpcomingCache } = await import('./klikterenAllUpcomingLoader');
  invalidateKlikterenUpcomingCache();

  try {
    await unlinkBookingFromLinkedGames(bookingId, linkedGameIds);
  } catch (error) {
    console.error('Failed to unlink cancelled booking from linked games', { bookingId, error });
  }

  await refreshSnapshot({ force: true });
}
