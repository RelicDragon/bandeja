export type CreateGameDeepLinkSearch = {
  clubId?: string;
  courtId?: string;
  startTime?: string;
  endTime?: string;
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

  return { gameData, bookingIds: parsed.bookingIds };
}
