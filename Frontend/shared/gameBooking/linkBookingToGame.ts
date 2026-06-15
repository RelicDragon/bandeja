import { BOOKTIME_DEFAULT_TIMEZONE, storedUtcIsoToInstant } from '../booktime/localTime';
import { buildBookingSnapshots } from './buildBookingSnapshots';
import type { BookingSnapshotInput, LinkBookingToGameBody } from './contracts';

export type LinkBookingGameRef = {
  id?: string;
  timeIsSet?: boolean | null;
  startTime?: string;
  endTime?: string;
  clubId?: string | null;
  courtId?: string | null;
  city?: { timezone?: string | null } | null;
  entityType?: string;
  status?: string;
  name?: string | null;
  participants?: Array<{ userId: string; role: string }>;
};

export type LinkBookingCourtRef = {
  id: string;
  externalCourtId?: string | null;
};

export type LinkBookingClubRef = {
  clubId: string;
  courts: LinkBookingCourtRef[];
};

export type LinkBookingRecord = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  bookingResource?: { id?: string; bookingResourceId?: string; uuid?: string };
  bookingResourceId?: string;
};

export type BuildLinkBookingRequestOptions = {
  courtId?: string;
  timeZone?: string | null;
  skipGameDatetimePatch?: boolean;
};

export type LinkBookingApi = {
  linkBooking: (gameId: string, body: LinkBookingToGameBody) => Promise<unknown>;
};

function bookingInstantMs(bookingStart: string, bookingEnd: string): {
  startMs: number;
  endMs: number;
} | null {
  const start = storedUtcIsoToInstant(bookingStart);
  const end = storedUtcIsoToInstant(bookingEnd);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function resolveBooktimeClubTimezone(options?: {
  club?: LinkBookingClubRef | { integrationType?: string | null } | null;
  game?: LinkBookingGameRef | null;
  explicit?: string | null;
}): string {
  if (options?.explicit) return options.explicit;
  if (options?.club) {
    if ('clubId' in options.club && !('integrationType' in options.club)) {
      return BOOKTIME_DEFAULT_TIMEZONE;
    }
    if ('integrationType' in options.club && options.club.integrationType === 'BOOKTIME') {
      return BOOKTIME_DEFAULT_TIMEZONE;
    }
  }
  return options?.game?.city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
}

export function bookingMatchesGameSlot(
  booking: LinkBookingRecord,
  game: LinkBookingGameRef,
  timeZone?: string | null,
): boolean {
  if (game.timeIsSet !== true) return false;
  const tz = timeZone ?? resolveBooktimeClubTimezone({ game });
  if (!tz) {
    return (
      new Date(game.startTime!).getTime() === new Date(booking.bookingStart).getTime() &&
      new Date(game.endTime!).getTime() === new Date(booking.bookingEnd).getTime()
    );
  }
  const bookingMs = bookingInstantMs(booking.bookingStart, booking.bookingEnd);
  if (!bookingMs) return false;
  return (
    new Date(game.startTime!).getTime() === bookingMs.startMs &&
    new Date(game.endTime!).getTime() === bookingMs.endMs
  );
}

export function isRecommendedLinkTarget(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  timeZone?: string | null,
): boolean {
  return bookingMatchesGameSlot(booking, game, timeZone);
}

export function filterLinkableGames<T extends LinkBookingGameRef>(
  games: T[],
  userId: string,
  now = new Date(),
): T[] {
  const nowMs = now.getTime();
  return games.filter((game) => {
    if (game.entityType !== 'GAME') return false;
    if (game.status !== 'ANNOUNCED') return false;
    const isOwner = game.participants?.some((p) => p.userId === userId && p.role === 'OWNER');
    if (!isOwner) return false;
    if (game.timeIsSet === false) return true;
    if (game.timeIsSet === true) {
      return new Date(game.startTime!).getTime() >= nowMs;
    }
    return false;
  });
}

export function sortLinkableGames<T extends LinkBookingGameRef>(
  games: T[],
  booking: LinkBookingRecord,
  timeZone?: string | null,
): T[] {
  const recommended: T[] = [];
  const rest: T[] = [];
  for (const game of games) {
    if (isRecommendedLinkTarget(game, booking, timeZone)) recommended.push(game);
    else rest.push(game);
  }
  const byStart = (a: T, b: T) =>
    new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime();
  recommended.sort(byStart);
  rest.sort(byStart);
  return [...recommended, ...rest];
}

export function gameNeedsDatetimeUpdateForLink(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  timeZone?: string | null,
): boolean {
  return game.timeIsSet !== true || !bookingMatchesGameSlot(booking, game, timeZone);
}

export function buildLinkBookingSnapshot(
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  courtId?: string,
  timeZone?: string | null,
): BookingSnapshotInput | undefined {
  const tz = resolveBooktimeClubTimezone({ club, explicit: timeZone });
  const snapshots = buildBookingSnapshots([booking], club.courts, { timeZone: tz });
  if (courtId && snapshots[0]) snapshots[0].courtId = courtId;
  return snapshots[0];
}

export function buildLinkBookingToGameUpdate(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  courtId?: string,
  timeZone?: string | null,
  skipGameDatetimePatch = false,
): Partial<LinkBookingGameRef & { hasBookedCourt?: boolean }> {
  const tz = resolveBooktimeClubTimezone({ club, game, explicit: timeZone });
  const update: Partial<LinkBookingGameRef & { hasBookedCourt?: boolean }> = {
    hasBookedCourt: true,
  };
  if (!skipGameDatetimePatch && gameNeedsDatetimeUpdateForLink(game, booking, tz)) {
    const snapshot = buildLinkBookingSnapshot(booking, club, courtId, tz);
    update.startTime = snapshot?.bookingStart ?? booking.bookingStart;
    update.endTime = snapshot?.bookingEnd ?? booking.bookingEnd;
    update.timeIsSet = true;
  }
  if (club.clubId && game.clubId !== club.clubId) {
    update.clubId = club.clubId;
  }
  if (courtId && game.courtId !== courtId) {
    update.courtId = courtId;
  }
  return update;
}

export function buildLinkBookingRequest(
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  options?: BuildLinkBookingRequestOptions,
): LinkBookingToGameBody {
  const tz = resolveBooktimeClubTimezone({ club, game, explicit: options?.timeZone });
  const snapshot = buildLinkBookingSnapshot(booking, club, options?.courtId, tz);
  if (!snapshot) {
    throw new Error('Booking snapshot required to link');
  }
  const gameUpdate = buildLinkBookingToGameUpdate(
    game,
    booking,
    club,
    options?.courtId,
    tz,
    options?.skipGameDatetimePatch,
  );
  const gamePatch: LinkBookingToGameBody['gamePatch'] = {};
  if (gameUpdate.hasBookedCourt !== undefined) gamePatch.hasBookedCourt = gameUpdate.hasBookedCourt;
  if (typeof gameUpdate.clubId === 'string') gamePatch.clubId = gameUpdate.clubId;
  if (typeof gameUpdate.courtId === 'string') gamePatch.courtId = gameUpdate.courtId;
  if (typeof gameUpdate.startTime === 'string') gamePatch.startTime = gameUpdate.startTime;
  if (typeof gameUpdate.endTime === 'string') gamePatch.endTime = gameUpdate.endTime;
  if (gameUpdate.timeIsSet === true) gamePatch.timeIsSet = true;
  return {
    externalBookingId: booking.uuid,
    snapshot,
    ...(Object.keys(gamePatch).length > 0 ? { gamePatch } : {}),
  };
}

export function buildCreateGameDeepLinkParams(
  clubId: string,
  booking: LinkBookingRecord,
  courtId?: string,
  timeZone?: string | null,
): Record<string, string> {
  const tz = resolveBooktimeClubTimezone({ explicit: timeZone });
  const snapshot = buildLinkBookingSnapshot(booking, { clubId, courts: [] }, courtId, tz);
  const startTime = snapshot?.bookingStart ?? booking.bookingStart;
  const endTime = snapshot?.bookingEnd ?? booking.bookingEnd;
  const params: Record<string, string> = {
    clubId,
    locationTimeMode: 'bookings',
    bookingIds: booking.uuid,
    hasBookedCourt: '1',
    startTime,
    endTime,
  };
  if (courtId) params.courtId = courtId;
  return params;
}

export async function linkBookingToGame(
  api: LinkBookingApi,
  gameId: string,
  game: LinkBookingGameRef,
  booking: LinkBookingRecord,
  club: LinkBookingClubRef,
  options?: BuildLinkBookingRequestOptions,
): Promise<unknown> {
  const body = buildLinkBookingRequest(game, booking, club, options);
  return api.linkBooking(gameId, body);
}
