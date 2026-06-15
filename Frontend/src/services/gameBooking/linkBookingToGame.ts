import { gamesApi } from '@/api/games';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Game } from '@/types';
import {
  linkBookingToGame as linkBookingToGameCore,
  type BuildLinkBookingRequestOptions,
} from '@shared/gameBooking/linkBookingToGame';

export type LinkBookingToGameArgs = {
  gameId: string;
  game: Game;
  booking: BooktimeBookingRecord;
  club: BooktimeMyClubRow;
  options?: BuildLinkBookingRequestOptions;
};

export async function linkBookingToGame({
  gameId,
  game,
  booking,
  club,
  options,
}: LinkBookingToGameArgs): Promise<unknown> {
  return linkBookingToGameCore(gamesApi, gameId, game, booking, club, options);
}

export {
  bookingMatchesGameSlot,
  buildCreateGameDeepLinkParams,
  buildLinkBookingRequest,
  filterLinkableGames,
  gameNeedsDatetimeUpdateForLink,
  isRecommendedLinkTarget,
  resolveBooktimeClubTimezone,
  sortLinkableGames,
} from '@shared/gameBooking/linkBookingToGame';
