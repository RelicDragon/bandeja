import { ApiError } from '../../utils/ApiError';
import type { BooktimeBusySlot } from '../booktimeBusySnapshot';
import {
  BOOKTIME_DEFAULT_TIMEZONE,
  booktimeIngestToStoredUtcIso,
  isBooktimeNaiveLocalIso,
  storedUtcIsoToInstant,
} from './localTime';

/** Ingest raw Booktime API wire-format (fake-Z / naive local). */
export function normalizeBooktimeWireIngestIso(
  iso: string,
  fieldLabel: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string {
  const normalized = booktimeIngestToStoredUtcIso(iso, timeZone);
  if (!normalized || !storedUtcIsoToInstant(normalized)) {
    throw new ApiError(400, `${fieldLabel} is unparseable`);
  }
  return normalized;
}

/** Parse stored UTC or naive local; does not re-ingest fake-Z. */
export function normalizeBooktimeIngestIso(
  iso: string,
  fieldLabel: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string {
  const trimmed = iso.trim();
  if (isBooktimeNaiveLocalIso(trimmed)) {
    return normalizeBooktimeWireIngestIso(trimmed, fieldLabel, timeZone);
  }
  const instant = storedUtcIsoToInstant(trimmed);
  if (!instant) {
    throw new ApiError(400, `${fieldLabel} is unparseable`);
  }
  return instant.toISOString();
}

export function parseBusySlotsForIngest(
  raw: unknown,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): BooktimeBusySlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: BooktimeBusySlot[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, `busySlots[${i}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const startTime = record.startTime;
    const endTime = record.endTime;
    if (typeof startTime !== 'string' || typeof endTime !== 'string') {
      throw new ApiError(400, `busySlots[${i}] must have startTime and endTime strings`);
    }
    const startIso = normalizeBooktimeWireIngestIso(
      startTime,
      `busySlots[${i}].startTime`,
      timeZone,
    );
    const endIso = normalizeBooktimeWireIngestIso(endTime, `busySlots[${i}].endTime`, timeZone);
    const start = storedUtcIsoToInstant(startIso)!;
    const end = storedUtcIsoToInstant(endIso)!;
    if (end <= start) {
      throw new ApiError(400, `busySlots[${i}] endTime must be after startTime`);
    }
    slots.push({ startTime: startIso, endTime: endIso });
  }
  return slots;
}

export function ingestBookingSnapshotTimes(
  bookingStart: string | undefined,
  bookingEnd: string | undefined,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): { bookingStart: Date | null; bookingEnd: Date | null } {
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (bookingStart?.trim()) {
    const iso = normalizeBooktimeIngestIso(bookingStart, 'bookingStart', timeZone);
    startDate = storedUtcIsoToInstant(iso);
  }
  if (bookingEnd?.trim()) {
    const iso = normalizeBooktimeIngestIso(bookingEnd, 'bookingEnd', timeZone);
    endDate = storedUtcIsoToInstant(iso);
  }
  if (startDate && endDate && endDate <= startDate) {
    throw new ApiError(400, 'bookingEnd must be after bookingStart');
  }
  return { bookingStart: startDate, bookingEnd: endDate };
}
