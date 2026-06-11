import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Game } from '@/types';

export function bookingMatchesGameSlot(booking: BooktimeBookingRecord, game: Game): boolean {
  if (game.timeIsSet !== true) return false;
  return (
    new Date(game.startTime).getTime() === new Date(booking.bookingStart).getTime() &&
    new Date(game.endTime).getTime() === new Date(booking.bookingEnd).getTime()
  );
}

export function isRecommendedLinkTarget(game: Game, booking: BooktimeBookingRecord): boolean {
  return bookingMatchesGameSlot(booking, game);
}

export function filterLinkableGames(games: Game[], userId: string, now = new Date()): Game[] {
  const nowMs = now.getTime();
  return games.filter((game) => {
    if (game.entityType !== 'GAME') return false;
    if (game.status !== 'ANNOUNCED') return false;
    if (game.externalBookingId) return false;
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

export function buildLinkBookingToGameUpdate(
  game: Game,
  booking: BooktimeBookingRecord,
  club: BooktimeMyClubRow,
  courtId?: string
): Partial<Game> {
  const update: Partial<Game> = {
    externalBookingId: booking.uuid,
    externalBookingProvider: 'BOOKTIME',
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
