import axios from 'axios';
import { gamesApi } from '@/api/games';
import { queryKeys } from '@/queries/queryKeys';
import { queryClient } from '@/queries/queryClient';
import { useAuthStore } from '@/store/authStore';
import { pickNextGame, type NextGameCandidate } from '@/utils/pickNextGame';

let inFlight: Promise<string> | null = null;

function pathFromGames(games: NextGameCandidate[]): string {
  const next = pickNextGame(games);
  return next ? `/games/${next.id}` : '/';
}

async function resolveNextGamePathOnce(): Promise<string> {
  const { isAuthenticated, user } = useAuthStore.getState();
  if (!isAuthenticated) {
    return '/login';
  }

  const userId = user?.id;
  if (userId) {
    const cached = queryClient.getQueryData<{ games: NextGameCandidate[] }>(
      queryKeys.games.my(userId),
    );
    if (cached?.games) {
      return pathFromGames(cached.games);
    }
  }

  try {
    const res = await gamesApi.getMyGames();
    return pathFromGames(res.data ?? []);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return '/login';
    }
    return '/';
  }
}

/** Path for assistant / deep link “open next game”. Dedupes concurrent callers. */
export function resolveNextGamePath(): Promise<string> {
  if (!inFlight) {
    inFlight = resolveNextGamePathOnce().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
