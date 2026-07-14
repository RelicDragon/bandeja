import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';
import { queryKeys } from '../queryKeys';
import { getGamesFromAvailableCache } from './availableGamesCache';
import {
  findCachesContainGameId,
  patchGameInGamesCaches,
} from './patchGameInGamesCaches';
import type { MyGamesData } from './useMyGamesQuery';
import type { AvailableGamesPage } from './availableGamesPage';
import { EMPTY_AVAILABLE_META } from './availableGamesPage';

function game(id: string, name = id): Game {
  return { id, name } as Game;
}

function page(games: Game[]): AvailableGamesPage {
  return { games, meta: EMPTY_AVAILABLE_META };
}

describe('patchGameInGamesCaches', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
  });

  it('patches My and Find when game id is present', () => {
    const myKey = queryKeys.games.my('u1');
    const availKey = queryKeys.games.available('hash-a');
    const upcomingKey = queryKeys.games.availableUpcoming('hash-u');

    client.setQueryData<MyGamesData>(myKey, {
      games: [game('g1', 'old')],
      invites: [],
      unreadCounts: {},
    });
    client.setQueryData(availKey, page([game('g1', 'old'), game('g2')]));
    client.setQueryData(upcomingKey, page([game('g3')]));

    const result = patchGameInGamesCaches(client, game('g1', 'new'));

    expect(result.patchedMy).toBe(true);
    expect(result.patchedFind).toBe(true);
    expect(result.findContainedGame).toBe(true);
    expect(client.getQueryData<MyGamesData>(myKey)?.games[0].name).toBe('new');
    expect(getGamesFromAvailableCache(client.getQueryData(availKey))?.[0].name).toBe('new');
    expect(getGamesFromAvailableCache(client.getQueryData(upcomingKey))?.[0].name).toBe('g3');
  });

  it('does not touch Find caches when game is absent', () => {
    const availKey = queryKeys.games.available('hash-a');
    client.setQueryData(availKey, page([game('other')]));

    const result = patchGameInGamesCaches(client, game('g1', 'new'));

    expect(result.findContainedGame).toBe(false);
    expect(result.patchedFind).toBe(false);
    expect(getGamesFromAvailableCache(client.getQueryData(availKey))?.[0].id).toBe('other');
  });

  it('merges socket updates onto cached Find rows without fat detail trees', () => {
    const availKey = queryKeys.games.available('hash-a');
    client.setQueryData(
      availKey,
      page([
        { id: 'g1', name: 'old', userNote: 'keep-me', weatherSummary: { temp: 20 } } as Game,
      ]),
    );

    patchGameInGamesCaches(client, {
      id: 'g1',
      name: 'new',
      resultsArtifacts: { status: 'done' },
      participants: [
        {
          userId: 'u1',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'u1', bio: 'fat', level: 4 },
        },
      ],
    } as never);

    const patched = getGamesFromAvailableCache(client.getQueryData(availKey))?.[0] as Game & {
      userNote?: string;
      weatherSummary?: { temp: number };
      resultsArtifacts?: unknown;
    };
    expect(patched.name).toBe('new');
    expect(patched.userNote).toBe('keep-me');
    expect(patched.weatherSummary).toEqual({ temp: 20 });
    expect(patched.resultsArtifacts).toBeUndefined();
    expect((patched.participants[0].user as { bio?: string }).bio).toBeUndefined();
    expect((patched.participants[0].user as { level?: number }).level).toBe(4);
  });

  it('findCachesContainGameId scans available slices only', () => {
    client.setQueryData(queryKeys.games.available('h'), page([game('g1')]));
    expect(findCachesContainGameId(client, 'g1')).toBe(true);
    expect(findCachesContainGameId(client, 'missing')).toBe(false);
  });

  it('still patches legacy Game[] caches and migrates to page shape', () => {
    const availKey = queryKeys.games.available('legacy');
    client.setQueryData(availKey, [game('g1', 'old')]);

    const result = patchGameInGamesCaches(client, game('g1', 'new'));
    const cached = client.getQueryData(availKey);

    expect(result.patchedFind).toBe(true);
    expect(Array.isArray(cached)).toBe(false);
    expect(getGamesFromAvailableCache(cached)?.[0].name).toBe('new');
  });
});
