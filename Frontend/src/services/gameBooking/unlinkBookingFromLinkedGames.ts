import { booktimeApi } from '@/api/booktime';
import { gamesApi } from '@/api/games';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';

export async function fetchLinkedGameIdsForBooking(externalBookingId: string): Promise<string[]> {
  const res = await booktimeApi.getLinkedGames(externalBookingId);
  return (res.data ?? []).map((game) => game.id);
}

export async function unlinkBookingFromLinkedGames(
  externalBookingId: string,
  gameIds?: string[],
): Promise<string[]> {
  const targetGameIds = gameIds ?? (await fetchLinkedGameIdsForBooking(externalBookingId));
  if (targetGameIds.length === 0) return [];

  const results = await Promise.allSettled(
    targetGameIds.map((gameId) => gamesApi.patchBookings(gameId, { remove: [externalBookingId] })),
  );

  const failed = results
    .map((result, index) => ({ result, gameId: targetGameIds[index] }))
    .filter((entry): entry is { result: PromiseRejectedResult; gameId: string } =>
      entry.result.status === 'rejected',
    );
  if (failed.length > 0) {
    console.error('Failed to unlink cancelled booking from games', {
      externalBookingId,
      failedGameIds: failed.map((entry) => entry.gameId),
      errors: failed.map((entry) => entry.result.reason),
    });
  }

  const unlinkedGameIds = targetGameIds.filter((_, index) => results[index].status === 'fulfilled');
  if (unlinkedGameIds.length > 0) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
  }

  return unlinkedGameIds;
}
