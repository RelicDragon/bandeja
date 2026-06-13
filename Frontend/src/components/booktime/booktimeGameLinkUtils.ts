import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Game } from '@/types';
import { linkedBookingToRecord } from '@/components/booktime/booktimeBookingUtils';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';

type LinkedBookingLike = {
  externalBookingId?: string;
  courtId?: string;
  bookingStart?: string;
  bookingEnd?: string;
};

export function bookingMatchesGameSlot(booking: BooktimeBookingRecord, game: Game): boolean {
  if (game.timeIsSet !== true) return false;
  return (
    new Date(game.startTime).getTime() === new Date(booking.bookingStart).getTime() &&
    new Date(game.endTime).getTime() === new Date(booking.bookingEnd).getTime()
  );
}

export function linkedBookingMatchesGame(link: LinkedBookingLike, game: Game): boolean {
  if (!link.bookingStart || !link.bookingEnd) return false;

  const gameCourtId = game.courtId ?? game.court?.id;
  if (link.courtId) {
    if (!gameCourtId || link.courtId !== gameCourtId) return false;
  }

  const booking = linkedBookingToRecord({
    externalBookingId: link.externalBookingId ?? '',
    bookingStart: link.bookingStart,
    bookingEnd: link.bookingEnd,
  });
  return bookingMatchesGameSlot(booking, game);
}

export function isRecommendedLinkTarget(game: Game, booking: BooktimeBookingRecord): boolean {
  return bookingMatchesGameSlot(booking, game);
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

export function sortLinkableGames(games: Game[], booking: BooktimeBookingRecord): Game[] {
  const recommended: Game[] = [];
  const rest: Game[] = [];
  for (const game of games) {
    if (isRecommendedLinkTarget(game, booking)) recommended.push(game);
    else rest.push(game);
  }
  const byStart = (a: Game, b: Game) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  recommended.sort(byStart);
  rest.sort(byStart);
  return [...recommended, ...rest];
}

export function gameNeedsDatetimeUpdateForLink(game: Game, booking: BooktimeBookingRecord): boolean {
  return game.timeIsSet !== true || !bookingMatchesGameSlot(booking, game);
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
) {
  const courts = club.courts.map((c) => ({
    id: c.id,
    externalCourtId: c.externalCourtId,
  }));
  const snapshots = buildBookingSnapshots([booking], courts);
  if (courtId && snapshots[0]) snapshots[0].courtId = courtId;
  return snapshots[0];
}

export function buildLinkBookingToGameUpdate(
  game: Game,
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  courtId?: string
): Partial<Game> {
  const update: Partial<Game> = {
    hasBookedCourt: true,
  };
  if (gameNeedsDatetimeUpdateForLink(game, booking)) {
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
