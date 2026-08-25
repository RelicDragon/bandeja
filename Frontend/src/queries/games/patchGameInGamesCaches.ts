import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';
import { clearMyTabCache } from '@/api/me';
import { queryKeys } from '../queryKeys';
import {
  availableGamesCacheContainsGameId,
  getGamesFromAvailableCache,
  isAvailableGamesPage,
  withPatchedAvailableGames,
} from './availableGamesCache';
import { mergeFindCardGame } from './mergeFindCardGame';
import type { MyGamesData } from './useMyGamesQuery';
import type { PastGamesPage } from './usePastGamesQuery';
import { scheduleFindQueryRevalidation } from './findQueryRevalidation';

function replaceGameInArray(
  games: Game[],
  nextGame: Game,
  merge: (existing: Game, incoming: Game) => Game,
): Game[] | null {
  let changed = false;
  const next = games.map((game) => {
    if (game.id !== nextGame.id) return game;
    changed = true;
    return merge(game, nextGame);
  });
  return changed ? next : null;
}

const mergeMyOrPast = (existing: Game, incoming: Game): Game => {
  const next = { ...existing, ...incoming };
  // Socket payloads often omit or send empty outcomes; never wipe standings by accident.
  const incomingOutcomes = incoming.outcomes;
  const incompleteOutcomes =
    !('outcomes' in incoming) ||
    incomingOutcomes === undefined ||
    incomingOutcomes === null ||
    (Array.isArray(incomingOutcomes) && incomingOutcomes.length === 0);
  if (incompleteOutcomes) {
    next.outcomes = existing.outcomes;
  }
  return next;
};

export type PatchGameInCachesResult = {
  patchedMy: boolean;
  patchedFind: boolean;
  findContainedGame: boolean;
};

/**
 * Merge a socket/API game into cached games slices by id.
 * Find lists are only touched when the gameId already exists in that cache.
 * Find merges stay card-slim (no detail-tree re-inflate).
 */
export function patchGameInGamesCaches(
  queryClient: QueryClient,
  nextGame: Game,
  options?: { userId?: string },
): PatchGameInCachesResult {
  const gameId = nextGame.id;
  let patchedMy = false;
  let patchedFind = false;
  let findContainedGame = false;

  const queries = queryClient.getQueriesData({ queryKey: queryKeys.games.all });

  for (const [key, data] of queries) {
    if (!data) continue;
    const keyParts = key as readonly string[];

    if (keyParts[1] === 'my' && typeof data === 'object' && 'games' in data) {
      const cached = data as MyGamesData;
      const nextGames = replaceGameInArray(cached.games, nextGame, mergeMyOrPast);
      let invitesChanged = false;
      const nextInvites = cached.invites.map((invite) => {
        if (!invite.game || invite.game.id !== gameId) return invite;
        invitesChanged = true;
        return { ...invite, game: mergeMyOrPast(invite.game, nextGame) };
      });
      if (!nextGames && !invitesChanged) continue;
      queryClient.setQueryData<MyGamesData>(key, {
        ...cached,
        games: nextGames ?? cached.games,
        invites: nextInvites,
      });
      patchedMy = true;
      continue;
    }

    if (keyParts[1] === 'past') {
      const cached = data as InfiniteData<PastGamesPage>;
      let pagesChanged = false;
      const nextPages = cached.pages.map((page) => {
        const nextGames = replaceGameInArray(page.games, nextGame, mergeMyOrPast);
        if (!nextGames) return page;
        pagesChanged = true;
        return { ...page, games: nextGames };
      });
      if (!pagesChanged) continue;
      queryClient.setQueryData(key, { ...cached, pages: nextPages });
      continue;
    }

    if (keyParts[1] === 'available' || keyParts[1] === 'availableUpcoming') {
      const list = getGamesFromAvailableCache(data);
      if (!list) continue;
      const cardContainsGame = list.some((g) => g.id === gameId);
      const indexContainsGame = Boolean(
        isAvailableGamesPage(data) &&
        data.meta.dayIndex?.some((row) => row.id === gameId),
      );
      if (!cardContainsGame && !indexContainsGame) continue;
      findContainedGame = true;
      // Index rows contain derived city-day/filter/participant fields. A socket
      // card is not authoritative enough to patch those; refetch this month only.
      if (indexContainsGame) {
        scheduleFindQueryRevalidation(queryClient, key);
      }
      if (!cardContainsGame) continue;
      const nextList = replaceGameInArray(list, nextGame, mergeFindCardGame);
      if (!nextList) continue;
      queryClient.setQueryData(key, withPatchedAvailableGames(data, nextList));
      patchedFind = true;
    }
  }

  if (options?.userId && patchedMy) {
    clearMyTabCache(options.userId);
  }

  return { patchedMy, patchedFind, findContainedGame };
}

export function findCachesContainGameId(
  queryClient: QueryClient,
  gameId: string,
): boolean {
  const queries = queryClient.getQueriesData({ queryKey: queryKeys.games.all });
  for (const [key, data] of queries) {
    if (!data) continue;
    const keyParts = key as readonly string[];
    if (keyParts[1] !== 'available' && keyParts[1] !== 'availableUpcoming') continue;
    if (availableGamesCacheContainsGameId(data, gameId)) return true;
  }
  return false;
}

/** Invalidate only Find list/calendar queries that currently hold this game id. */
export function invalidateFindQueriesContainingGame(
  queryClient: QueryClient,
  gameId: string,
): void {
  const queries = queryClient.getQueriesData({ queryKey: queryKeys.games.all });
  for (const [key, data] of queries) {
    const parts = key as readonly unknown[];
    if (parts[1] !== 'available' && parts[1] !== 'availableUpcoming') continue;
    if (!availableGamesCacheContainsGameId(data, gameId)) continue;
    scheduleFindQueryRevalidation(queryClient, key);
  }
}
