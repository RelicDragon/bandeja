import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game, Invite } from '@/types';

const { patchMyTabCacheUserNote } = vi.hoisted(() => ({
  patchMyTabCacheUserNote: vi.fn(),
}));

vi.mock('@/api/me', () => ({
  patchMyTabCacheUserNote: (...args: unknown[]) => patchMyTabCacheUserNote(...args),
}));

import { patchUserGameNoteInCaches } from './patchUserGameNoteInCaches';
import { queryKeys } from '../queryKeys';
import type { MyGamesData } from './useMyGamesQuery';
import type { PastGamesPage } from './usePastGamesQuery';

function sampleGame(id: string, userNote?: string | null): Game {
  return { id, userNote } as Game;
}

function sampleInvite(id: string, game: Game): Invite {
  return { id, game } as Invite;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('patchUserGameNoteInCaches', () => {
  beforeEach(() => {
    patchMyTabCacheUserNote.mockReset();
  });

  it('patches my games, invites, past games, and available games caches', () => {
    const client = createTestClient();

    client.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [sampleGame('game-1', 'old'), sampleGame('game-2')],
      invites: [sampleInvite('inv-1', sampleGame('game-1', 'old'))],
      unreadCounts: {},
    });

    client.setQueryData(queryKeys.games.past('user-1'), {
      pages: [{ games: [sampleGame('game-1', 'old')], offset: 0 }],
      pageParams: [0],
    });

    client.setQueryData(queryKeys.games.available('city-1-false-primary-0'), [
      sampleGame('game-1', 'old'),
    ]);

    patchUserGameNoteInCaches(client, 'game-1', 'updated note');

    expect(patchMyTabCacheUserNote).toHaveBeenCalledWith('game-1', 'updated note');

    const myGames = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(myGames?.games.find((g) => g.id === 'game-1')?.userNote).toBe('updated note');
    expect(myGames?.invites[0]?.game?.userNote).toBe('updated note');
    expect(myGames?.games.find((g) => g.id === 'game-2')?.userNote).toBeUndefined();

    const pastGames = client.getQueryData<{ pages: PastGamesPage[] }>(queryKeys.games.past('user-1'));
    expect(pastGames?.pages[0]?.games[0]?.userNote).toBe('updated note');

    const availableGames = client.getQueryData<Game[]>(
      queryKeys.games.available('city-1-false-primary-0'),
    );
    expect(availableGames?.[0]?.userNote).toBe('updated note');
  });

  it('clears userNote when note is deleted', () => {
    const client = createTestClient();

    client.setQueryData<MyGamesData>(queryKeys.games.my('user-1'), {
      games: [sampleGame('game-1', 'remove me')],
      invites: [],
      unreadCounts: {},
    });

    patchUserGameNoteInCaches(client, 'game-1', null);

    const myGames = client.getQueryData<MyGamesData>(queryKeys.games.my('user-1'));
    expect(myGames?.games[0]?.userNote).toBeNull();
  });
});
