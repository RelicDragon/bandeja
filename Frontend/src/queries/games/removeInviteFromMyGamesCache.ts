import type { QueryClient } from '@tanstack/react-query';
import { clearMyTabCache } from '@/api/me';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

export function removeInviteFromMyGamesCache(
  queryClient: QueryClient,
  userId: string | undefined,
  inviteId: string,
): void {
  if (!userId) return;

  clearMyTabCache(userId);

  queryClient.setQueryData<MyGamesData>(
    queryKeys.games.my(userId),
    (old) => {
      if (!old) return old;
      const nextInvites = old.invites.filter((inv) => inv.id !== inviteId);
      if (nextInvites.length === old.invites.length) return old;
      return { ...old, invites: nextInvites };
    },
  );
}
