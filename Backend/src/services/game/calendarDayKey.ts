const formatterByTimezone = new Map<string, Intl.DateTimeFormat>();
const warnedInvalidTimezones = new Set<string>();

function warnInvalidTimezoneOnce(timezone: string): void {
  if (!timezone || warnedInvalidTimezones.has(timezone)) return;
  warnedInvalidTimezones.add(timezone);
  console.warn('[calendarDayKey] invalid city timezone; using UTC date fallback', {
    timezone,
  });
}

function formatterForTimezone(timezone: string): Intl.DateTimeFormat {
  const key = timezone || 'UTC';
  const cached = formatterByTimezone.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: key,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatterByTimezone.set(key, formatter);
  return formatter;
}

/** Fast city-local yyyy-MM-dd projection for large calendar indexes. */
export function formatCalendarDayKey(date: Date, timezone: string): string {
  try {
    const parts = formatterForTimezone(timezone).formatToParts(date);
    let year = '';
    let month = '';
    let day = '';
    for (const part of parts) {
      if (part.type === 'year') year = part.value;
      else if (part.type === 'month') month = part.value;
      else if (part.type === 'day') day = part.value;
    }
    return year && month && day
      ? `${year}-${month}-${day}`
      : date.toISOString().slice(0, 10);
  } catch {
    warnInvalidTimezoneOnce(timezone);
    return date.toISOString().slice(0, 10);
  }
}
