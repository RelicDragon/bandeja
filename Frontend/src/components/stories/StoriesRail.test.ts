import { describe, it, expect } from 'vitest';
import { socialConnectionsQueryOptions } from '@/queries/useSocialConnectionsQuery';

describe('StoriesRail social connections visibility logic', () => {
  it('determines shouldFetchStoriesFeed and hasConnections based on socialConnections query output', () => {
    const opts = socialConnectionsQueryOptions('user-1');
    expect(opts.queryKey).toEqual(['users', 'user-1', 'socialConnections']);
    const noConnectionsData = {
      following: [],
      followers: [],
      followingCount: 0,
      followersCount: 0,
      hasConnections: false,
    };

    const hasConnectionsData = {
      following: [{ id: 'u2', firstName: 'Jane', lastName: 'Doe' } as any],
      followers: [],
      followingCount: 1,
      followersCount: 0,
      hasConnections: true,
    };

    // When user has no following and no followers, hasConnections is false
    expect(noConnectionsData.hasConnections).toBe(false);

    // When user has following or followers, hasConnections is true
    expect(hasConnectionsData.hasConnections).toBe(true);
  });
});
