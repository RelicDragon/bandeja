import type { QueryClient } from '@tanstack/react-query';
import { clearMyTabCache } from '@/api/me';
import type { Invite } from '@/types';
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
    (old: MyGamesData | undefined) => {
      if (!old) return old;
      const nextInvites = old.invites.filter((inv: Invite) => inv.id !== inviteId);
      if (nextInvites.length === old.invites.length) return old;
      return { ...old, invites: nextInvites };
    },
  );
}
