import type { Game } from '@/types';
import { isPendingGameInvite } from './gameInviteParticipant';

export function isPendingInviteOnlyMyGame(
  game: Pick<Game, 'participants'>,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  const mine = (game.participants ?? []).filter((p) => p.userId === userId);
  return mine.length > 0 && mine.every(isPendingGameInvite);
}

export function excludePendingInviteOnlyMyGames<T extends Pick<Game, 'participants'>>(
  games: T[],
  userId: string | undefined,
): T[] {
  if (!userId) return games;
  return games.filter((game) => !isPendingInviteOnlyMyGame(game, userId));
}
