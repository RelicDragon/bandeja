export const BOOKTIME_DEFAULT_TIMEZONE = 'Europe/Belgrade';

const HAS_TZ_SUFFIX = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

export type BooktimeLocalComponents = {
  dateKey: string;
  hour: number;
  minute: number;
};

export function parseBooktimeLocalComponents(iso: string): BooktimeLocalComponents | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  return {
    dateKey: match[1],
    hour: Number(match[2]),
    minute: Number(match[3]),
  };
}

export function isBooktimeNaiveLocalIso(iso: string): boolean {
  const trimmed = iso.trim();
  return parseBooktimeLocalComponents(trimmed) !== null && !HAS_TZ_SUFFIX.test(trimmed);
}

/** Interpret a Booktime naive local ISO string as an instant in the given IANA timezone. */
export function booktimeLocalIsoToDate(
  localIso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): Date | null {
  const parts = parseBooktimeLocalComponents(localIso);
  if (!parts) return null;
  const { dateKey, hour, minute } = parts;
  const probe = new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const formatted = formatter.formatToParts(probe);
  const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '0';
  const displayedMinutes = Number(get('hour')) * 60 + Number(get('minute'));
  const targetMinutes = hour * 60 + minute;
  return new Date(probe.getTime() + (targetMinutes - displayedMinutes) * 60_000);
}

/** Raw Booktime API ISO: Belgrade wall-clock, often suffixed with fake `.000Z`. */
export function booktimeApiWallClockToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  const instant = booktimeLocalIsoToDate(iso.trim(), timeZone);
  return instant ? instant.toISOString() : null;
}

export function storedUtcIsoToInstant(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Convert naive Booktime local ISO to stored UTC; pass through real UTC ISO. */
export function booktimeIsoToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  if (isBooktimeNaiveLocalIso(iso)) {
    return booktimeApiWallClockToUtcIso(iso, timeZone);
  }
  const instant = storedUtcIsoToInstant(iso);
  return instant ? instant.toISOString() : null;
}

export function booktimeIsoToInstant(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): Date | null {
  if (isBooktimeNaiveLocalIso(iso)) {
    return booktimeLocalIsoToDate(iso, timeZone);
  }
  return storedUtcIsoToInstant(iso);
}

/** Naive wall-clock → stored UTC; real UTC ISO passes through unchanged. */
export function parseBooktimeStoredOrNaiveToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  if (isBooktimeNaiveLocalIso(iso)) {
    return booktimeApiWallClockToUtcIso(iso, timeZone);
  }
  const instant = storedUtcIsoToInstant(iso);
  return instant ? instant.toISOString() : null;
}

export function parseBooktimeStoredOrNaiveToDate(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): Date | null {
  const utcIso = parseBooktimeStoredOrNaiveToUtcIso(iso, timeZone);
  return utcIso ? storedUtcIsoToInstant(utcIso) : null;
}

export function booktimeBookingStartMs(
  bookingStart: string,
  _timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): number {
  const parsed = storedUtcIsoToInstant(bookingStart);
  if (parsed) return parsed.getTime();
  const fallback = new Date(bookingStart).getTime();
  return Number.isNaN(fallback) ? 0 : fallback;
}
