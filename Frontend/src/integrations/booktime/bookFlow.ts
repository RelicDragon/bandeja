import type { Sport } from '@shared/sport';
import type { Club } from '@/types';
import type { BooktimeClient, BooktimeCompany } from './client';
import { resolveBooktimeServiceUuid } from './resolveBooktimeServiceUuid';
import { BOOKTIME_DEFAULT_TIMEZONE, booktimeIsoToInstant } from './localTime';
import {
  BOOKTIME_CONFIRM_RECHECK_MS,
  isSnapshotOlderThan,
  slotFitsAvailableRanges,
  type BooktimeBookingDuration,
} from './slots';
import { getBooktimeExternalUserId } from './session';
import { formatBooktimeErrorMessage } from './formatBooktimeErrorMessage';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';

export type BooktimePendingBooking = {
  clubId: string;
  courtId: string;
  externalCourtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: BooktimeBookingDuration;
  sport?: Sport | null;
};

export type BooktimeBookFlowContext = {
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>;
  lastFetchedAt: string | null;
};

export type BooktimeBookingRange = {
  bookingStart: string;
  bookingEnd: string;
};

export class BooktimeSlotTakenError extends Error {
  constructor(message: string = BOOKING_ERROR_KEYS.slotNoLongerAvailable) {
    super(message);
    this.name = 'BooktimeSlotTakenError';
  }
}

const companyCache = new Map<string, Promise<BooktimeCompany>>();

export function loadBooktimeCompany(client: BooktimeClient, companyId: string): Promise<BooktimeCompany> {
  let pending = companyCache.get(companyId);
  if (!pending) {
    pending = client.getCompany();
    companyCache.set(companyId, pending);
  }
  return pending;
}

export function resolveServiceUuid(
  company: BooktimeCompany,
  externalCourtId: string,
  integrationConfig?: Club['integrationConfig'],
  sportHint?: Sport | null,
): string {
  return resolveBooktimeServiceUuid(company, externalCourtId, integrationConfig, sportHint);
}

export function buildBookingIsoRange(
  dateKey: string,
  startTime: string,
  durationMinutes: number
): BooktimeBookingRange {
  const [h, m] = startTime.split(':').map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + durationMinutes;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    bookingStart: `${dateKey}T${pad(h)}:${pad(m)}`,
    bookingEnd: `${dateKey}T${pad(endH)}:${pad(endM)}`,
  };
}

export async function isSlotStillFree(
  client: BooktimeClient,
  pending: BooktimePendingBooking,
  selectedDate: Date
): Promise<boolean> {
  const slotsRes = await client.getAvailableSlots(selectedDate, pending.dateKey);
  const courtRow = slotsRes.find((row) => row.uuid === pending.externalCourtId);
  if (!courtRow) return false;

  const [sh, sm] = pending.startTime.split(':').map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + pending.durationMinutes;

  return slotFitsAvailableRanges(slotStartMin, slotEndMin, courtRow.availableSlots ?? []);
}

export function isBooktimeSlotTakenError(err: unknown): boolean {
  if (err instanceof BooktimeSlotTakenError) return true;
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

export async function confirmBooktimeBooking(
  client: BooktimeClient,
  club: Club,
  companyId: string,
  pending: BooktimePendingBooking,
  selectedDate: Date,
  ctx: BooktimeBookFlowContext
): Promise<{ bookingId: string; bookingStart: string; bookingEnd: string; price?: number }> {
  if (isSnapshotOlderThan(ctx.lastFetchedAt, BOOKTIME_CONFIRM_RECHECK_MS)) {
    await ctx.refreshSnapshot();
  }

  const stillFree = await isSlotStillFree(client, pending, selectedDate);
  if (!stillFree) {
    await ctx.refreshSnapshot({ force: true });
    throw new BooktimeSlotTakenError();
  }

  const externalUserId = getBooktimeExternalUserId(club.id);
  if (!externalUserId) throw new Error(BOOKING_ERROR_KEYS.sessionExpired);

  const company = await loadBooktimeCompany(client, companyId);
  const serviceUuid = resolveServiceUuid(
    company,
    pending.externalCourtId,
    club.integrationConfig,
    pending.sport,
  );
  const { bookingStart, bookingEnd } = buildBookingIsoRange(
    pending.dateKey,
    pending.startTime,
    pending.durationMinutes
  );

  const priceRes = await client.getPrice({ bookingStart, bookingEnd, serviceUuid });

  let booking: { uuid: string };
  try {
    booking = await client.createBooking({
      bookingStart,
      bookingEnd,
      userId: externalUserId,
      bookingResourceId: pending.externalCourtId,
      serviceId: serviceUuid,
    });
  } catch (err) {
    if (isBooktimeSlotTakenError(err)) {
      await ctx.refreshSnapshot({ force: true });
      throw new BooktimeSlotTakenError(formatBooktimeErrorMessage(err, BOOKING_ERROR_KEYS.slotNoLongerAvailable));
    }
    throw err;
  }

  await ctx.refreshSnapshot({ force: true });

  return {
    bookingId: booking.uuid,
    bookingStart,
    bookingEnd,
    price: priceRes.price,
  };
}

export function canCancelByPolicy(
  bookingStart: string,
  allowedHoursToCancel: number,
  clubTimezone?: string | null
): boolean {
  const start =
    booktimeIsoToInstant(bookingStart, clubTimezone ?? BOOKTIME_DEFAULT_TIMEZONE);
  if (!start) return false;
  const startMs = start.getTime();
  if (Number.isNaN(startMs)) return false;
  return startMs - Date.now() >= allowedHoursToCancel * 60 * 60 * 1000;
}

export async function cancelBooktimeBooking(
  client: BooktimeClient,
  bookingId: string,
  refreshSnapshot: (options?: { force?: boolean }) => Promise<boolean>
): Promise<void> {
  await client.cancelBooking(bookingId);
  await refreshSnapshot({ force: true });
}
