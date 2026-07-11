import type { QueryClient } from '@tanstack/react-query';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useAuthStore } from '@/store/authStore';
import { clearMyTabCache } from '@/api/me';
import { queryKeys } from './queryKeys';

let initialized = false;
let unsubscribe: (() => void) | null = null;

function invalidateGamesQueries(queryClient: QueryClient): void {
  if (!useNetworkStore.getState().isOnline) return;
  clearMyTabCache(useAuthStore.getState().user?.id);
  void queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
}

export function setupQueryInvalidationBridge(queryClient: QueryClient): void {
  if (initialized) return;
  initialized = true;

  unsubscribe = useSocketEventsStore.subscribe((state, prevState) => {
    if (state.lastGameUpdate !== prevState.lastGameUpdate && state.lastGameUpdate) {
      invalidateGamesQueries(queryClient);
    }
    if (state.lastNewInvite !== prevState.lastNewInvite && state.lastNewInvite) {
      invalidateGamesQueries(queryClient);
    }
    if (state.lastInviteDeleted !== prevState.lastInviteDeleted && state.lastInviteDeleted) {
      invalidateGamesQueries(queryClient);
    }
  });
}

export function teardownQueryInvalidationBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
}
