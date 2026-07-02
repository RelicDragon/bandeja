import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';
import { patchMyTabCacheUserNote } from '@/api/me';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';
import type { PastGamesPage } from './usePastGamesQuery';

function applyUserNoteToGame(game: Game, gameId: string, userNote: string | null): Game {
  if (game.id !== gameId) return game;
  if (game.userNote === userNote) return game;
  return { ...game, userNote };
}

function patchGamesArray(
  games: Game[],
  gameId: string,
  userNote: string | null,
): Game[] | null {
  let changed = false;
  const next = games.map((game) => {
    const patched = applyUserNoteToGame(game, gameId, userNote);
    if (patched !== game) changed = true;
    return patched;
  });
  return changed ? next : null;
}

export function patchUserGameNoteInCaches(
  queryClient: QueryClient,
  gameId: string,
  userNote: string | null,
): void {
  patchMyTabCacheUserNote(gameId, userNote);

  const queries = queryClient.getQueriesData({ queryKey: queryKeys.games.all });

  for (const [key, data] of queries) {
    if (!data) continue;
    const keyParts = key as readonly string[];

    if (keyParts[1] === 'my' && typeof data === 'object' && 'games' in data) {
      const cached = data as MyGamesData;
      const nextGames = patchGamesArray(cached.games, gameId, userNote);
      let invitesChanged = false;
      const nextInvites = cached.invites.map((invite) => {
        if (!invite.game || invite.game.id !== gameId) return invite;
        const nextGame = applyUserNoteToGame(invite.game, gameId, userNote);
        if (nextGame === invite.game) return invite;
        invitesChanged = true;
        return { ...invite, game: nextGame };
      });
      if (!nextGames && !invitesChanged) continue;
      queryClient.setQueryData<MyGamesData>(key, {
        ...cached,
        games: nextGames ?? cached.games,
        invites: nextInvites,
      });
      continue;
    }

    if (keyParts[1] === 'past') {
      const cached = data as InfiniteData<PastGamesPage>;
      let pagesChanged = false;
      const nextPages = cached.pages.map((page) => {
        const nextGames = patchGamesArray(page.games, gameId, userNote);
        if (!nextGames) return page;
        pagesChanged = true;
        return { ...page, games: nextGames };
      });
      if (!pagesChanged) continue;
      queryClient.setQueryData(key, { ...cached, pages: nextPages });
      continue;
    }

    if (keyParts[1] === 'available' || keyParts[1] === 'availableUpcoming') {
      if (!Array.isArray(data)) continue;
      const nextGames = patchGamesArray(data as Game[], gameId, userNote);
      if (!nextGames) continue;
      queryClient.setQueryData(key, nextGames);
    }
  }
}
