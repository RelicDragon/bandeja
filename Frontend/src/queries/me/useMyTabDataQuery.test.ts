import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  removeQueries: vi.fn(),
  clearMyTabCache: vi.fn(),
  useMyGamesQuery: vi.fn(),
}));

vi.mock('../queryClient', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
    removeQueries: mocks.removeQueries,
  },
}));

vi.mock('@/api/me', () => ({
  clearMyTabCache: (...args: unknown[]) => mocks.clearMyTabCache(...args),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-1' } }),
}));

vi.mock('@/queries/games/useMyGamesQuery', () => ({
  useMyGamesQuery: (...args: unknown[]) => mocks.useMyGamesQuery(...args),
  myGamesQueryOptions: vi.fn(),
}));

import { clearMyTabData, invalidateMyTabData, useMyTabDataQuery } from './useMyTabDataQuery';
import { queryKeys } from '../queryKeys';

describe('useMyTabDataQuery cache bridge', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    mocks.removeQueries.mockReset();
    mocks.clearMyTabCache.mockReset();
    mocks.useMyGamesQuery.mockReset();
  });

  it('useMyTabDataQuery delegates to useMyGamesQuery', () => {
    mocks.useMyGamesQuery.mockReturnValue({ data: null });
    useMyTabDataQuery();
    expect(mocks.useMyGamesQuery).toHaveBeenCalledWith('user-1', { enabled: true });
  });

  it('invalidateMyTabData targets games.my', () => {
    invalidateMyTabData('user-1');
    expect(mocks.clearMyTabCache).toHaveBeenCalledWith('user-1');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('user-1'),
    });
  });

  it('clearMyTabData removes games.my', () => {
    clearMyTabData('user-1');
    expect(mocks.clearMyTabCache).toHaveBeenCalledWith('user-1');
    expect(mocks.removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('user-1'),
    });
  });
});
