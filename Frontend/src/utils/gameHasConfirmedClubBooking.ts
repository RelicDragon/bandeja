import type { Game } from '@/types';

export function gameHasConfirmedClubBooking(game: Game): boolean {
  if (game.timeIsSet !== true || game.hasBookedCourt !== true) return false;
  const hasCourt = Boolean(game.courtId || game.court);
  const hasClub = Boolean(game.clubId || game.club || game.court?.club);
  return hasCourt && hasClub;
}

export function gameHasLinkedExternalBooking(game: Game): boolean {
  return (game.linkedBookings?.length ?? 0) > 0;
}
