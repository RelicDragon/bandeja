import { beforeEach, describe, expect, it } from 'vitest';
import type { Invite } from '@/types';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import { headerService } from '@/services/headerService';
import { useHeaderStore } from '@/store/headerStore';
import { useAuthStore } from '@/store/authStore';

describe('headerService', () => {
  beforeEach(() => {
    queryClient.clear();
    useHeaderStore.setState({
      pendingInvites: 0,
      decrementedInviteIds: new Set(),
    });
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'user-1' } as ReturnType<typeof useAuthStore.getState>['user'],
    });
  });

  it('hydrates pending invite count from my-tab query cache', () => {
    queryClient.setQueryData(queryKeys.games.my('user-1'), {
      games: [],
      invites: [
        { id: 'i1', status: 'PENDING' },
        { id: 'i2', status: 'PENDING' },
      ] as Invite[],
      unreadCounts: {},
    });

    const hydrated = headerService.hydratePendingInvitesFromCache();
    expect(hydrated).toBe(true);
    expect(useHeaderStore.getState().pendingInvites).toBe(2);
  });
});
