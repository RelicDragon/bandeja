import type { Game } from '@/types';

export function isEventOptedInForMyTab(
  game: Pick<Game, 'entityType' | 'participants'>,
  userId: string | undefined,
): boolean {
  if (game.entityType !== 'EVENT') return true;
  if (!userId) return false;
  const mine = (game.participants ?? []).find((participant) => participant.userId === userId);
  return (
    mine?.role === 'OWNER' || mine?.status === 'PLAYING' || mine?.lookingForPartner === true
  );
}

export function excludeUnoptedEventsFromMyGames(games: Game[], userId: string | undefined): Game[];
export function excludeUnoptedEventsFromMyGames<T extends Pick<Game, 'entityType' | 'participants'>>(
  games: T[],
  userId: string | undefined,
): T[];
export function excludeUnoptedEventsFromMyGames(
  games: Pick<Game, 'entityType' | 'participants'>[],
  userId: string | undefined,
): Pick<Game, 'entityType' | 'participants'>[] {
  return games.filter((game) => isEventOptedInForMyTab(game, userId));
}
