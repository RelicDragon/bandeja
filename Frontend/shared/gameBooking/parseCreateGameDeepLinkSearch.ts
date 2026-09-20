export type CreateGameDeepLinkSearch = {
  clubId?: string;
  courtId?: string;
  startTime?: string;
  endTime?: string;
  /**
   * PRD 354 — day-only prefill (`yyyy-MM-dd`) from the club page's court chips.
   * Independent of `startTime`: the club strip knows the day the player tapped,
   * not the slot. Ignored when `startTime` is present, which already pins a day.
   */
  date?: string;
  hasBookedCourt: boolean;
  bookingIds: string[];
  /** Parsed for backward compatibility; mode is derived from bookingIds in the UI. */
  locationTimeMode?: 'bookings' | 'timeSlots';
};

export function parseBookingIdsParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getSearchParam(search: string, key: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) return null;
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    if (decodeURIComponent(rawKey.replace(/\+/g, ' ')) !== key) continue;
    if (eq === -1) return '';
    return decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
  }
  return null;
}

/**
 * `yyyy-MM-dd` only, and only a real calendar date. A malformed value is
 * dropped rather than passed through, so the wizard never seeds an Invalid Date.
 */
export function parseCreateGameDateParam(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const [y, m, d] = trimmed.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return undefined;
  }
  return trimmed;
}

/** `yyyy-MM-dd` → local noon ISO, matching `headerStore.setCreateGameInitialDate`. */
export function createGameDateToLocalNoonIso(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

export function parseCreateGameDeepLinkSearch(search: string): CreateGameDeepLinkSearch {
  const locationTimeModeRaw = getSearchParam(search, 'locationTimeMode');
  const locationTimeMode =
    locationTimeModeRaw === 'bookings'
      ? 'bookings'
      : locationTimeModeRaw === 'timeSlots'
        ? 'timeSlots'
        : undefined;

  return {
    clubId: getSearchParam(search, 'clubId') ?? undefined,
    courtId: getSearchParam(search, 'courtId') ?? undefined,
    startTime: getSearchParam(search, 'startTime') ?? undefined,
    endTime: getSearchParam(search, 'endTime') ?? undefined,
    date: parseCreateGameDateParam(getSearchParam(search, 'date')),
    hasBookedCourt: getSearchParam(search, 'hasBookedCourt') === '1',
    bookingIds: parseBookingIdsParam(getSearchParam(search, 'bookingIds')),
    locationTimeMode,
  };
}

export function createGameDataFromDeepLinkSearch(search: string): {
  gameData: {
    clubId?: string;
    courtId?: string;
    startTime?: string;
    endTime?: string;
    hasBookedCourt?: boolean;
  };
  bookingIds: string[];
  /** Day-only prefill; the wizard seeds its date picker from it. */
  date?: string;
} {
  const parsed = parseCreateGameDeepLinkSearch(search);
  const gameData: {
    clubId?: string;
    courtId?: string;
    startTime?: string;
    endTime?: string;
    hasBookedCourt?: boolean;
  } = {};

  if (parsed.clubId) gameData.clubId = parsed.clubId;
  if (parsed.courtId) gameData.courtId = parsed.courtId;
  if (parsed.startTime) gameData.startTime = parsed.startTime;
  if (parsed.endTime) gameData.endTime = parsed.endTime;
  if (parsed.hasBookedCourt) gameData.hasBookedCourt = true;
  // Day-only prefill uses the same convention as `setCreateGameInitialDate`:
  // local noon on the chosen day, which pins the wizard's date without
  // pretending a slot was picked. `startTime` always wins if both are present.
  if (parsed.date && !gameData.startTime) {
    gameData.startTime = createGameDateToLocalNoonIso(parsed.date);
  }

  return { gameData, bookingIds: parsed.bookingIds, date: parsed.date };
}
