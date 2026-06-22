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

export function parseCreateGameDeepLinkSearch(search: string): CreateGameDeepLinkSearch {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const locationTimeModeRaw = params.get('locationTimeMode');
  const locationTimeMode =
    locationTimeModeRaw === 'bookings'
      ? 'bookings'
      : locationTimeModeRaw === 'timeSlots'
        ? 'timeSlots'
        : undefined;

  return {
    clubId: params.get('clubId') ?? undefined,
    courtId: params.get('courtId') ?? undefined,
    startTime: params.get('startTime') ?? undefined,
    endTime: params.get('endTime') ?? undefined,
    hasBookedCourt: params.get('hasBookedCourt') === '1',
    bookingIds: parseBookingIdsParam(params.get('bookingIds')),
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
