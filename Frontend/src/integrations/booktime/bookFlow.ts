import type { Club } from '@/types';
import type { BooktimeClient, BooktimeCompany } from './client';
import {
  BOOKTIME_CONFIRM_RECHECK_MS,
  isSnapshotOlderThan,
  parseGetForDayResponse,
  slotOverlapsInterval,
  type BooktimeBookingDuration,
} from './slots';
import { getBooktimeExternalUserId } from './session';

export type BooktimePendingBooking = {
  clubId: string;
  courtId: string;
  externalCourtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: BooktimeBookingDuration;
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
  constructor(message = 'Slot no longer available') {
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
  integrationConfig?: Club['integrationConfig']
): string {
  for (const resource of company.bookingResources ?? []) {
    const id = resource.bookingResourceId ?? resource.uuid;
    if (id === externalCourtId && resource.serviceUuid) {
      return resource.serviceUuid;
    }
  }
  const configIds =
    integrationConfig &&
    typeof integrationConfig === 'object' &&
    !Array.isArray(integrationConfig) &&
    Array.isArray((integrationConfig as Record<string, unknown>).serviceIds)
      ? ((integrationConfig as Record<string, unknown>).serviceIds as unknown[]).filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
      : [];
  if (configIds.length === 1) return configIds[0]!;
  throw new Error('Online booking not configured for this court');
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

function normalizeBusyInterval(raw: Record<string, unknown>) {
  const startRaw = raw.bookingStart ?? raw.startTime;
  const endRaw = raw.bookingEnd ?? raw.endTime;
  if (typeof startRaw !== 'string' || typeof endRaw !== 'string') return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export async function isSlotStillFree(
  client: BooktimeClient,
  club: Club,
  pending: BooktimePendingBooking,
  selectedDate: Date
): Promise<boolean> {
  const dayData = await client.getForDay(selectedDate);
  const resources = parseGetForDayResponse(dayData);
  const resource = resources.find(
    (r) => (r.bookingResourceId ?? r.uuid) === pending.externalCourtId
  );
  if (!resource) return true;

  const [sh, sm] = pending.startTime.split(':').map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + pending.durationMinutes;

  const intervals = [...(resource.bookings ?? []), ...(resource.busySlots ?? [])];
  return !intervals.some((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const interval = normalizeBusyInterval(raw as Record<string, unknown>);
    if (!interval) return false;
    return slotOverlapsInterval(
      slotStartMin,
      slotEndMin,
      new Date(interval.startTime),
      new Date(interval.endTime),
      club,
      pending.dateKey
    );
  });
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

  const stillFree = await isSlotStillFree(client, club, pending, selectedDate);
  if (!stillFree) {
    await ctx.refreshSnapshot({ force: true });
    throw new BooktimeSlotTakenError();
  }

  const externalUserId = getBooktimeExternalUserId(club.id);
  if (!externalUserId) throw new Error('Club booking session expired');

  const company = await loadBooktimeCompany(client, companyId);
  const serviceUuid = resolveServiceUuid(company, pending.externalCourtId, club.integrationConfig);
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
      throw new BooktimeSlotTakenError();
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

export function canCancelByPolicy(bookingStart: string, allowedHoursToCancel: number): boolean {
  const startMs = new Date(bookingStart).getTime();
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
