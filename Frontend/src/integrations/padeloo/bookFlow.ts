import type { Sport } from '@shared/sport';
import type { Club } from '@/types';
import type { PadelooClient } from './client';
import { booktimeIsoToUtcIso } from '@/integrations/booktime/localTime';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import {
  isSnapshotOlderThan,
  slotFitsAvailableSlots,
  type PadelooBookingDuration,
  PADELOO_CONFIRM_RECHECK_MS,
} from './slots';
import { getPadelooExternalUserId } from './session';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { unlinkBookingFromLinkedGames, fetchLinkedGameIdsForBooking } from '@/services/gameBooking/unlinkBookingFromLinkedGames';

export type PadelooPendingBooking = {
  clubId: string;
  padelooClubId: number;
  courtId: string;
  externalCourtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: PadelooBookingDuration;
  sport?: Sport | null;
};

export type PadelooBookFlowContext = {
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  lastFetchedAt: string | null;
};

export class PadelooSlotTakenError extends Error {
  constructor(message: string = BOOKING_ERROR_KEYS.slotNoLongerAvailable) {
    super(message);
    this.name = 'PadelooSlotTakenError';
  }
}

const clubCache = new Map<number, Promise<Awaited<ReturnType<PadelooClient['getClub']>>>>();

export function loadPadelooClub(client: PadelooClient, padelooClubId: number) {
  let pending = clubCache.get(padelooClubId);
  if (!pending) {
    pending = client.getClub(padelooClubId);
    clubCache.set(padelooClubId, pending);
  }
  return pending;
}

export function buildPadelooEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(endH)}:${pad(endM)}`;
}

export async function isPadelooSlotStillFree(
  client: PadelooClient,
  pending: PadelooPendingBooking,
): Promise<boolean> {
  const slotsRes = await client.getAvailableSlots(
    pending.padelooClubId,
    pending.dateKey,
    pending.durationMinutes,
  );
  const courtRow = slotsRes.find((row) => String(row.courtId) === pending.externalCourtId);
  if (!courtRow) return false;

  const [sh, sm] = pending.startTime.split(':').map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + pending.durationMinutes;

  return slotFitsAvailableSlots(slotStartMin, slotEndMin, courtRow.slots ?? []);
}

export function isPadelooSlotTakenError(err: unknown): boolean {
  if (err instanceof PadelooSlotTakenError) return true;
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

export async function confirmPadelooBooking(
  client: PadelooClient,
  club: Club,
  padelooClubId: number,
  pending: PadelooPendingBooking,
  ctx: PadelooBookFlowContext,
): Promise<{ bookingId: string; bookingStart: string; bookingEnd: string; price?: number }> {
  if (isSnapshotOlderThan(ctx.lastFetchedAt, PADELOO_CONFIRM_RECHECK_MS)) {
    await ctx.refreshSnapshot();
  }

  const stillFree = await isPadelooSlotStillFree(client, pending);
  if (!stillFree) {
    await ctx.refreshSnapshot({ force: true });
    throw new PadelooSlotTakenError();
  }

  const externalUserId = getPadelooExternalUserId(club.id);
  if (!externalUserId) throw new Error(BOOKING_ERROR_KEYS.sessionExpired);

  const courtId = Number(pending.externalCourtId);
  if (!Number.isFinite(courtId)) throw new Error(BOOKING_ERROR_KEYS.slotNoLongerAvailable);

  let reservation;
  try {
    reservation = await client.createReservation({
      clubId: padelooClubId,
      courtId,
      date: pending.dateKey,
      startTime: pending.startTime,
      durationMinutes: pending.durationMinutes,
    });
  } catch (err) {
    if (isPadelooSlotTakenError(err)) {
      await ctx.refreshSnapshot({ force: true });
      throw new PadelooSlotTakenError(BOOKING_ERROR_KEYS.slotNoLongerAvailable);
    }
    throw err;
  }

  await ctx.refreshSnapshot({ force: true });

  const clubTimezone = getClubTimezone(club);
  const endTime = reservation.endTime ?? buildPadelooEndTime(pending.startTime, pending.durationMinutes);
  const bookingStartLocal = `${pending.dateKey}T${pending.startTime}`;
  const bookingEndLocal = `${pending.dateKey}T${endTime}`;

  return {
    bookingId: String(reservation.id),
    bookingStart: booktimeIsoToUtcIso(bookingStartLocal, clubTimezone) ?? bookingStartLocal,
    bookingEnd: booktimeIsoToUtcIso(bookingEndLocal, clubTimezone) ?? bookingEndLocal,
    price: reservation.price,
  };
}

export function canCancelPadelooByPolicy(
  bookingStart: string,
  cancellationHours: number,
): boolean {
  const start = new Date(bookingStart);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() >= cancellationHours * 60 * 60 * 1000;
}

export async function cancelPadelooBooking(
  client: PadelooClient,
  bookingId: string,
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>,
): Promise<void> {
  const linkedGameIds = await fetchLinkedGameIdsForBooking(bookingId).catch((error) => {
    console.error('Failed to resolve linked games before booking cancel', { bookingId, error });
    return [];
  });

  await client.cancelReservation(bookingId);

  const { invalidatePadelooUpcomingCache } = await import('./padelooAllUpcomingLoader');
  invalidatePadelooUpcomingCache();

  try {
    await unlinkBookingFromLinkedGames(bookingId, linkedGameIds);
  } catch (error) {
    console.error('Failed to unlink cancelled booking from linked games', { bookingId, error });
  }

  await refreshSnapshot({ force: true });
}
