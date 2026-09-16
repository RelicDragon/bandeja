import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { GameTextInvalidation } from '@shared/gameTextRealtime';
import { queryKeys } from '@/queries/queryKeys';
import { invalidateGameTextCachesForEvent } from './invalidateGameTextCaches';

vi.mock('@/api/me', () => ({
  clearMyTabCache: vi.fn(),
}));

vi.mock('@/queries/games/patchGameInGamesCaches', () => ({
  invalidateFindQueriesContainingGame: vi.fn(),
}));

import { clearMyTabCache } from '@/api/me';
import { invalidateFindQueriesContainingGame } from '@/queries/games/patchGameInGamesCaches';

function event(partial?: Partial<GameTextInvalidation>): GameTextInvalidation {
  return {
    version: 1,
    gameId: 'g1',
    locale: 'ru',
    nameSourceRevision: 2,
    descriptionSourceRevision: 3,
    reason: 'published',
    occurredAt: '2026-09-16T00:00:00.000Z',
    ...partial,
  };
}

describe('invalidateGameTextCachesForEvent', () => {
  it('invalidates detail + locale my/past and find for matching event', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    invalidateGameTextCachesForEvent(client, event(), { userId: 'u1' });

    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.detail('g1', 'ru'),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.detail('g1'),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1', 'ru'),
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.past('u1', 'ru'),
    });
    expect(clearMyTabCache).toHaveBeenCalledWith('u1');
    expect(invalidateFindQueriesContainingGame).toHaveBeenCalledWith(client, 'g1');
  });

  it('ignores non-v1 or incomplete payloads', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidateGameTextCachesForEvent(client, event({ version: 2 as 1 }));
    invalidateGameTextCachesForEvent(client, event({ gameId: '' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
