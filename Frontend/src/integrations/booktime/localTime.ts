export const BOOKTIME_DEFAULT_TIMEZONE = 'Europe/Belgrade';

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

/** Interpret a Booktime naive local ISO string as an instant in the given IANA timezone. */
export function booktimeLocalIsoToDate(
  localIso: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE
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

export function booktimeBookingStartMs(
  bookingStart: string,
  timeZone: string = BOOKTIME_DEFAULT_TIMEZONE
): number {
  const parsed = booktimeLocalIsoToDate(bookingStart, timeZone);
  if (parsed) return parsed.getTime();
  const fallback = new Date(bookingStart).getTime();
  return Number.isNaN(fallback) ? 0 : fallback;
}
