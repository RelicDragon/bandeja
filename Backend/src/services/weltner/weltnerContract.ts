import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ApiError } from '../../utils/ApiError';

export const WELTNER_DURATIONS = [60, 90, 120, 180];
export const WELTNER_ORIGIN = 'https://booking.weltner.site';
export type WeltnerSlot = { start: string; end: string; duration: number };
export type WeltnerAvailability = {
  court: string;
  date: string;
  slots: WeltnerSlot[];
};

export function normalizeWeltnerPhone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || !/^[+\d\s().-]+$/.test(value)) {
    throw new ApiError(400, 'weltner.invalidPhone');
  }
  const phone = value.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ApiError(400, 'weltner.invalidPhone');
  return phone;
}

export function assertWeltnerDate(date: string, timezone: string, now = new Date()): void {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ApiError(400, 'weltner.invalidDate');
  }
  const today = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const max = new Date(`${today}T12:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 30);
  if (date < today || date > max.toISOString().slice(0, 10))
    throw new ApiError(400, 'weltner.dateRange');
}

export function weltnerBookingRange(
  date: string,
  start: string,
  duration: number,
  timezone: string,
) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !WELTNER_DURATIONS.includes(duration)) {
    throw new ApiError(400, 'weltner.invalidSlot');
  }
  const bookingStart = fromZonedTime(`${date}T${start}:00`, timezone);
  if (
    !Number.isFinite(bookingStart.getTime()) ||
    formatInTimeZone(bookingStart, timezone, 'yyyy-MM-dd HH:mm') !== `${date} ${start}`
  ) {
    throw new ApiError(400, 'weltner.invalidSlot');
  }
  return {
    bookingStart,
    bookingEnd: new Date(bookingStart.getTime() + duration * 60_000),
  };
}

export function parseWeltnerAvailability(
  raw: unknown,
  court: string,
  date: string,
): WeltnerAvailability {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('court' in raw) ||
    raw.court !== court ||
    !('date' in raw) ||
    raw.date !== date ||
    !('slots' in raw) ||
    !Array.isArray(raw.slots)
  ) {
    throw new ApiError(502, 'weltner.invalidResponse');
  }
  const slots: WeltnerSlot[] = raw.slots.map((slot: unknown) => {
    if (
      !slot ||
      typeof slot !== 'object' ||
      !('start' in slot) ||
      !('end' in slot) ||
      !('duration' in slot) ||
      typeof slot.start !== 'string' ||
      typeof slot.end !== 'string' ||
      typeof slot.duration !== 'number' ||
      !WELTNER_DURATIONS.includes(slot.duration) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end)
    ) {
      throw new ApiError(502, 'weltner.invalidResponse');
    }
    const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    if ((minutes(slot.end) - minutes(slot.start) + 1440) % 1440 !== slot.duration)
      throw new ApiError(502, 'weltner.invalidResponse');
    return { start: slot.start, end: slot.end, duration: slot.duration };
  });
  return { court, date, slots };
}
