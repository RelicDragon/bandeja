import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Game } from '@/types';
import { storedUtcIsoToInstant } from '@shared/booktime/localTime';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';

function bookingInstantMs(bookingStart: string, bookingEnd: string): {
  startMs: number;
  endMs: number;
} | null {
  const start = storedUtcIsoToInstant(bookingStart);
  const end = storedUtcIsoToInstant(bookingEnd);
  if (!start || !end) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function bookingMatchesGameSlot(
  booking: BooktimeBookingRecord,
  game: Game,
  timeZone?: string | null,
): boolean {
  if (game.timeIsSet !== true) return false;
  const tz = timeZone ?? game.city?.timezone ?? undefined;
  if (!tz) {
    return (
      new Date(game.startTime).getTime() === new Date(booking.bookingStart).getTime() &&
      new Date(game.endTime).getTime() === new Date(booking.bookingEnd).getTime()
    );
  }
  const bookingMs = bookingInstantMs(booking.bookingStart, booking.bookingEnd);
  if (!bookingMs) return false;
  return (
    new Date(game.startTime).getTime() === bookingMs.startMs &&
    new Date(game.endTime).getTime() === bookingMs.endMs
  );
}

export function isRecommendedLinkTarget(
  game: Game,
  booking: BooktimeBookingRecord,
  timeZone?: string | null,
): boolean {
  return bookingMatchesGameSlot(booking, game, timeZone);
}

export function filterLinkableGames(games: Game[], userId: string, now = new Date()): Game[] {
  const nowMs = now.getTime();
  return games.filter((game) => {
    if (game.entityType !== 'GAME') return false;
    if (game.status !== 'ANNOUNCED') return false;
    const isOwner = game.participants?.some((p) => p.userId === userId && p.role === 'OWNER');
    if (!isOwner) return false;
    if (game.timeIsSet === false) return true;
    if (game.timeIsSet === true) {
      return new Date(game.startTime).getTime() >= nowMs;
    }
    return false;
  });
}

export function sortLinkableGames(
  games: Game[],
  booking: BooktimeBookingRecord,
  timeZone?: string | null,
): Game[] {
  const recommended: Game[] = [];
  const rest: Game[] = [];
  for (const game of games) {
    if (isRecommendedLinkTarget(game, booking, timeZone)) recommended.push(game);
    else rest.push(game);
  }
  const byStart = (a: Game, b: Game) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  recommended.sort(byStart);
  rest.sort(byStart);
  return [...recommended, ...rest];
}

export function gameNeedsDatetimeUpdateForLink(
  game: Game,
  booking: BooktimeBookingRecord,
  timeZone?: string | null,
): boolean {
  return game.timeIsSet !== true || !bookingMatchesGameSlot(booking, game, timeZone);
}

export function buildPatchBookingsBody(add: string[], remove: string[] = []) {
  return {
    add: add.length > 0 ? add : undefined,
    remove: remove.length > 0 ? remove : undefined,
  };
}

export function buildLinkBookingSnapshot(
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  courtId?: string,
  timeZone?: string | null,
) {
  const courts = club.courts.map((c) => ({
    id: c.id,
    externalCourtId: c.externalCourtId,
  }));
  const snapshots = buildBookingSnapshots([booking], courts, {
    timeZone: timeZone ?? undefined,
  });
  if (courtId && snapshots[0]) snapshots[0].courtId = courtId;
  return snapshots[0];
}

export function buildLinkBookingToGameUpdate(
  game: Game,
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  courtId?: string,
  timeZone?: string | null,
): Partial<Game> {
  const tz = timeZone ?? game.city?.timezone ?? undefined;
  const update: Partial<Game> = {
    hasBookedCourt: true,
  };
  if (gameNeedsDatetimeUpdateForLink(game, booking, tz)) {
    update.startTime = booking.bookingStart;
    update.endTime = booking.bookingEnd;
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
