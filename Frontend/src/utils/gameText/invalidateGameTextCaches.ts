import type { QueryClient } from '@tanstack/react-query';
import type { GameTextInvalidation } from '@shared/gameTextRealtime';
import { queryKeys } from '@/queries/queryKeys';
import { invalidateFindQueriesContainingGame } from '@/queries/games/patchGameInGamesCaches';
import { clearMyTabCache } from '@/api/me';

/**
 * Invalidate locale-scoped game caches after `game-text:invalidate`.
 * Does not patch translated text from the socket payload (none is sent).
 */
export function invalidateGameTextCachesForEvent(
  queryClient: QueryClient,
  event: GameTextInvalidation,
  options?: { userId?: string },
): void {
  if (event.version !== 1 || !event.gameId || !event.locale) return;

  const { gameId, locale } = event;
  void queryClient.invalidateQueries({
    queryKey: queryKeys.games.detail(gameId, locale),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.games.detail(gameId),
  });

  const userId = options?.userId;
  if (userId) {
    clearMyTabCache(userId);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.games.my(userId, locale),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.games.past(userId, locale),
    });
  }

  invalidateFindQueriesContainingGame(queryClient, gameId);
}
