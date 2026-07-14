import type { QueryClient } from '@tanstack/react-query';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useAuthStore } from '@/store/authStore';
import { clearMyTabCache } from '@/api/me';
import type { Game } from '@/types';
import { queryKeys } from './queryKeys';
import {
  invalidateFindQueriesContainingGame,
  patchGameInGamesCaches,
} from './games/patchGameInGamesCaches';
import { removeInviteFromMyGamesCache } from './games/removeInviteFromMyGamesCache';

let initialized = false;
let unsubscribe: (() => void) | null = null;

function invalidateMyGamesOnly(queryClient: QueryClient, userId: string | undefined): void {
  if (!userId) return;
  clearMyTabCache(userId);
  void queryClient.invalidateQueries({ queryKey: queryKeys.games.my(userId) });
}

function onGameUpdate(queryClient: QueryClient, payload: {
  gameId: string;
  game?: Game | null;
}): void {
  const userId = useAuthStore.getState().user?.id;
  const game = payload.game;

  if (game && game.id) {
    const result = patchGameInGamesCaches(queryClient, game, { userId });
    if (!result.patchedMy) {
      invalidateMyGamesOnly(queryClient, userId);
    }
    return;
  }

  invalidateMyGamesOnly(queryClient, userId);
  invalidateFindQueriesContainingGame(queryClient, payload.gameId);
}

function onNewInvite(queryClient: QueryClient): void {
  invalidateMyGamesOnly(queryClient, useAuthStore.getState().user?.id);
}

function onInviteDeleted(
  queryClient: QueryClient,
  payload: { inviteId?: string; gameId?: string } | null,
): void {
  const userId = useAuthStore.getState().user?.id;
  if (payload?.inviteId && userId) {
    removeInviteFromMyGamesCache(queryClient, userId, payload.inviteId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.games.my(userId) });
    return;
  }
  invalidateMyGamesOnly(queryClient, userId);
}

/**
 * Socket → Query bridge.
 * Scopes My vs Find: never blanket-invalidate `['games']`.
 * Find available/upcoming are patched by game id when present; invites only touch My.
 */
export function setupQueryInvalidationBridge(queryClient: QueryClient): void {
  if (initialized) return;
  initialized = true;

  unsubscribe = useSocketEventsStore.subscribe((state, prevState) => {
    if (!useNetworkStore.getState().isOnline) return;

    if (state.lastGameUpdate !== prevState.lastGameUpdate && state.lastGameUpdate) {
      onGameUpdate(queryClient, state.lastGameUpdate);
    }
    if (state.lastNewInvite !== prevState.lastNewInvite && state.lastNewInvite) {
      onNewInvite(queryClient);
    }
    if (state.lastInviteDeleted !== prevState.lastInviteDeleted && state.lastInviteDeleted) {
      onInviteDeleted(queryClient, state.lastInviteDeleted);
    }
  });
}

export function teardownQueryInvalidationBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
}
