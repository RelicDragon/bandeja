import axios from 'axios';
import { gamesApi } from '@/api/games';
import { queryKeys } from '@/queries/queryKeys';
import { queryClient } from '@/queries/queryClient';
import { useAuthStore } from '@/store/authStore';
import {
  buildGameChatPath,
  buildGameLivePath,
  buildGamePath,
  deepLinkActionPath,
} from '@/deepLinks';
import { pickNextGame, type NextGameCandidate } from '@/utils/pickNextGame';

export type NextGameOpenMode = 'detail' | 'chat' | 'live';

const inFlightByMode = new Map<NextGameOpenMode, Promise<string>>();

function pathFromGames(games: NextGameCandidate[], mode: NextGameOpenMode): string {
  const next = pickNextGame(games);
  if (!next) return deepLinkActionPath('myGames');
  if (mode === 'chat') return buildGameChatPath(next.id);
  if (mode === 'live') return buildGameLivePath(next.id);
  return buildGamePath(next.id);
}

/** Resolve only after auth bootstrap so Cap/web never race isInitializing. */
function whenAuthReady(): Promise<void> {
  if (!useAuthStore.getState().isInitializing) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAuthStore.subscribe((s) => {
      if (!s.isInitializing) {
        unsub();
        resolve();
      }
    });
    if (!useAuthStore.getState().isInitializing) {
      unsub();
      resolve();
    }
  });
}

async function resolveNextGamePathOnce(mode: NextGameOpenMode): Promise<string> {
  await whenAuthReady();

  const { isAuthenticated, user } = useAuthStore.getState();
  if (!isAuthenticated) {
    return deepLinkActionPath('login');
  }

  const userId = user?.id;
  if (userId) {
    const cached = queryClient.getQueryData<{ games: NextGameCandidate[] }>(
      queryKeys.games.my(userId),
    );
    if (cached?.games) {
      return pathFromGames(cached.games, mode);
    }
  }

  try {
    const res = await gamesApi.getMyGames();
    return pathFromGames(res.data ?? [], mode);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return deepLinkActionPath('login');
    }
    return deepLinkActionPath('myGames');
  }
}

/** Path for assistant / deep link “open next game”. Dedupes concurrent callers per mode. */
export function resolveNextGamePath(mode: NextGameOpenMode = 'detail'): Promise<string> {
  const existing = inFlightByMode.get(mode);
  if (existing) return existing;
  const promise = resolveNextGamePathOnce(mode).finally(() => {
    inFlightByMode.delete(mode);
  });
  inFlightByMode.set(mode, promise);
  return promise;
}

export function nextGameOpenModeFromSearch(search: string): NextGameOpenMode {
  const open = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
    'open',
  );
  if (open === 'chat') return 'chat';
  if (open === 'live') return 'live';
  return 'detail';
}
