import type { QueryClient } from '@tanstack/react-query';
import { clearMyTabCache } from '@/api/me';
import type { Invite } from '@/types';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';

export function upsertInviteInMyGamesCache(
  queryClient: QueryClient,
  userId: string | undefined,
  invite: Invite | null | undefined,
): void {
  if (!userId || !invite?.id) return;

  clearMyTabCache(userId);

  queryClient.setQueryData<MyGamesData>(
    queryKeys.games.my(userId),
    (old: MyGamesData | undefined) => {
      if (!old) return old;
      const nextInvites = [invite, ...old.invites.filter((row) => row.id !== invite.id)];
      return { ...old, invites: nextInvites };
    },
  );
}
