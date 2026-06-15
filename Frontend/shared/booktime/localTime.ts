export const BOOKTIME_DEFAULT_TIMEZONE = 'Europe/Belgrade';

const HAS_TZ_SUFFIX = /(?:[zZ]|[+-]\d{2}:\d{2})$/;
const FAKE_UTC_SUFFIX = /\.000Z$/i;

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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHourMinuteInZone(instant: Date, timeZone: string): { hour: number; minute: number } {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '0';
  return { hour: Number(get('hour')), minute: Number(get('minute')) };
}

function buildFakeZFromComponents(
  dateKey: string,
  hour: number,
  minute: number,
): string {
  return `${dateKey}T${pad2(hour)}:${pad2(minute)}:00.000Z`;
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

/** Booktime wire-format (naive local or fake `.000Z`) → stored UTC ISO. */
export function booktimeWireFormatToStoredUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  const instant = booktimeLocalIsoToDate(iso.trim(), timeZone);
  return instant ? instant.toISOString() : null;
}

/** @deprecated Use {@link booktimeWireFormatToStoredUtcIso}. */
export function booktimeApiWallClockToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  return booktimeWireFormatToStoredUtcIso(iso, timeZone);
}

export function storedUtcIsoToInstant(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Heuristic: ISO may already be canonical stored UTC (safe to pass through re-parse).
 * False for naive local and for afternoon fake-Z that still needs wire ingest.
 * Prefer {@link booktimeIsoToUtcIso} after the API boundary — do not rely on this alone.
 */
export function isAlreadyStoredUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): boolean {
  const trimmed = iso.trim();
  if (!HAS_TZ_SUFFIX.test(trimmed) || isBooktimeNaiveLocalIso(trimmed)) return false;
  const instant = storedUtcIsoToInstant(trimmed);
  const parts = parseBooktimeLocalComponents(trimmed);
  if (!instant || !parts) return false;
  if (instant.getUTCHours() !== parts.hour || instant.getUTCMinutes() !== parts.minute) return false;

  const belgradeOfInstant = formatHourMinuteInZone(instant, timeZone);
  if (belgradeOfInstant.hour === parts.hour && belgradeOfInstant.minute === parts.minute) return false;

  const fromBelgrade = booktimeWireFormatToStoredUtcIso(
    buildFakeZFromComponents(parts.dateKey, belgradeOfInstant.hour, belgradeOfInstant.minute),
    timeZone,
  );
  if (fromBelgrade !== trimmed) return false;

  const wireFromParts = booktimeWireFormatToStoredUtcIso(
    buildFakeZFromComponents(parts.dateKey, parts.hour, parts.minute),
    timeZone,
  );
  if (!wireFromParts || wireFromParts === trimmed) return true;
  return wireFromParts !== fromBelgrade;
}

/** True when `.000Z` digits are Booktime API wall clock (wire ingest required once). */
export function isBooktimeFakeUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): boolean {
  const trimmed = iso.trim();
  if (!FAKE_UTC_SUFFIX.test(trimmed) || isBooktimeNaiveLocalIso(trimmed)) return false;
  if (!parseBooktimeLocalComponents(trimmed)) return false;
  const wireUtc = booktimeWireFormatToStoredUtcIso(trimmed, timeZone);
  const parsedUtc = storedUtcIsoToInstant(trimmed)?.toISOString() ?? null;
  return !!wireUtc && wireUtc !== parsedUtc;
}

function normalizeFakeOrStoredUtcIso(
  trimmed: string,
  instant: Date,
  parts: BooktimeLocalComponents,
  timeZone: string,
): string {
  const wireFromIso = booktimeWireFormatToStoredUtcIso(trimmed, timeZone);
  if (!wireFromIso) return instant.toISOString();

  const belgradeOfInstant = formatHourMinuteInZone(instant, timeZone);
  const fromBelgrade = booktimeWireFormatToStoredUtcIso(
    buildFakeZFromComponents(parts.dateKey, belgradeOfInstant.hour, belgradeOfInstant.minute),
    timeZone,
  );
  const wireFromParts = booktimeWireFormatToStoredUtcIso(
    buildFakeZFromComponents(parts.dateKey, parts.hour, parts.minute),
    timeZone,
  );
  const belgradeOfWireFromParts = wireFromParts
    ? formatHourMinuteInZone(storedUtcIsoToInstant(wireFromParts)!, timeZone)
    : null;
  const alreadyStoredUtc =
    wireFromIso !== trimmed
    && fromBelgrade === trimmed
    && wireFromIso !== fromBelgrade
    && instant.toISOString() === fromBelgrade
    && wireFromParts === wireFromIso
    && belgradeOfInstant.hour !== parts.hour
    && belgradeOfWireFromParts?.hour === parts.hour
    && belgradeOfInstant.hour !== belgradeOfWireFromParts.hour
    && parts.hour <= 8;
  if (alreadyStoredUtc) {
    return trimmed;
  }
  if (wireFromIso !== instant.toISOString()) {
    return wireFromIso;
  }
  return instant.toISOString();
}

/**
 * Booktime API wire ingest: naive local or fake `.000Z` wall clock → stored UTC.
 *
 * Call **once** at the Booktime client boundary (`BooktimeClient.normalizeBooking`, raw busy slots).
 * After that use {@link booktimeIsoToUtcIso} / {@link storedUtcIsoToInstant} — re-ingest
 * can shift afternoon stored UTC (−2h per call in CEST). Same `.000Z` string can mean
 * fake wall clock or stored UTC; callers must not pipe normalized snapshots back through here.
 */
export function booktimeIngestToStoredUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  const trimmed = iso.trim();
  if (isBooktimeNaiveLocalIso(trimmed)) {
    return booktimeWireFormatToStoredUtcIso(trimmed, timeZone);
  }

  const instant = storedUtcIsoToInstant(trimmed);
  const parts = parseBooktimeLocalComponents(trimmed);
  if (!instant || !parts) return null;

  if (FAKE_UTC_SUFFIX.test(trimmed)) {
    return normalizeFakeOrStoredUtcIso(trimmed, instant, parts, timeZone);
  }

  return instant.toISOString();
}

/** Parse stored UTC or naive local; does not re-ingest fake-Z (use {@link booktimeIngestToStoredUtcIso} at API boundary). */
export function booktimeIsoToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  const trimmed = iso.trim();
  if (isBooktimeNaiveLocalIso(trimmed)) {
    return booktimeWireFormatToStoredUtcIso(trimmed, timeZone);
  }

  const instant = storedUtcIsoToInstant(trimmed);
  if (!instant) return null;

  if (HAS_TZ_SUFFIX.test(trimmed)) {
    return instant.toISOString();
  }

  return null;
}

export function booktimeIsoToInstant(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): Date | null {
  const utcIso = booktimeIsoToUtcIso(iso, timeZone);
  return utcIso ? storedUtcIsoToInstant(utcIso) : null;
}

/** @deprecated Use {@link booktimeIsoToUtcIso}. */
export function parseBooktimeStoredOrNaiveToUtcIso(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): string | null {
  return booktimeIsoToUtcIso(iso, timeZone);
}

export function parseBooktimeStoredOrNaiveToDate(
  iso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): Date | null {
  return booktimeIsoToInstant(iso, timeZone);
}

export function booktimeBookingStartMs(
  bookingStart: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE,
): number {
  const parsed = booktimeIsoToInstant(bookingStart, timeZone);
  return parsed ? parsed.getTime() : 0;
}
