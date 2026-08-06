import { describe, it, expect, vi, beforeEach } from 'vitest';
import { favoritesApi } from '@/api/favorites';
import { socialConnectionsQueryOptions } from './useSocialConnectionsQuery';

vi.mock('@/api/favorites', () => ({
  favoritesApi: {
    getFollowing: vi.fn(),
    getFollowers: vi.fn(),
  },
}));

describe('useSocialConnectionsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queryOptions produces correct queryKey and is disabled when userId is empty', () => {
    const opts = socialConnectionsQueryOptions(undefined);
    expect(opts.queryKey).toEqual(['users', '', 'socialConnections']);
    expect(opts.enabled).toBe(false);
  });

  it('fetches following and followers and computes hasConnections correctly when both are empty', async () => {
    vi.mocked(favoritesApi.getFollowing).mockResolvedValue([]);
    vi.mocked(favoritesApi.getFollowers).mockResolvedValue([]);

    const opts = socialConnectionsQueryOptions('user-1');
    const data = await opts.queryFn!({} as any);

    expect(data.following).toEqual([]);
    expect(data.followers).toEqual([]);
    expect(data.followingCount).toBe(0);
    expect(data.followersCount).toBe(0);
    expect(data.hasConnections).toBe(false);
  });

  it('computes hasConnections as true if user has following', async () => {
    vi.mocked(favoritesApi.getFollowing).mockResolvedValue([{ id: 'u2', firstName: 'Alice', lastName: 'Smith' } as any]);
    vi.mocked(favoritesApi.getFollowers).mockResolvedValue([]);

    const opts = socialConnectionsQueryOptions('user-1');
    const data = await opts.queryFn!({} as any);

    expect(data.followingCount).toBe(1);
    expect(data.followersCount).toBe(0);
    expect(data.hasConnections).toBe(true);
  });

  it('computes hasConnections as true if user has followers', async () => {
    vi.mocked(favoritesApi.getFollowing).mockResolvedValue([]);
    vi.mocked(favoritesApi.getFollowers).mockResolvedValue([{ id: 'u3', firstName: 'Bob', lastName: 'Jones' } as any]);

    const opts = socialConnectionsQueryOptions('user-1');
    const data = await opts.queryFn!({} as any);

    expect(data.followingCount).toBe(0);
    expect(data.followersCount).toBe(1);
    expect(data.hasConnections).toBe(true);
  });

  it('returns fallback data when API calls throw', async () => {
    vi.mocked(favoritesApi.getFollowing).mockRejectedValue(new Error('Network error'));

    const opts = socialConnectionsQueryOptions('user-1');
    const data = await opts.queryFn!({} as any);

    expect(data.hasConnections).toBe(false);
    expect(data.followingCount).toBe(0);
    expect(data.followersCount).toBe(0);
  });
});
