import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';

const { getAvailableGamesEnrichment } = vi.hoisted(() => ({
  getAvailableGamesEnrichment: vi.fn(),
}));

vi.mock('@/api', () => ({
  gamesApi: {
    getAvailableGamesEnrichment: (...args: unknown[]) => getAvailableGamesEnrichment(...args),
  },
}));

import {
  attachAvailableGamesEnrichment,
  mergeEnrichmentOntoGames,
} from './attachAvailableGamesEnrichment';
import type { AvailableGamesPage } from '@/queries/games/availableGamesPage';
import { EMPTY_AVAILABLE_META } from '@/queries/games/availableGamesPage';

describe('attachAvailableGamesEnrichment', () => {
  beforeEach(() => {
    getAvailableGamesEnrichment.mockReset();
  });

  it('merges enrichment onto matching games without dropping core rows', () => {
    const games = [
      { id: 'g1', name: 'A' },
      { id: 'g2', name: 'B' },
    ] as Game[];
    const merged = mergeEnrichmentOntoGames(games, {
      g1: { userNote: 'note', reactions: [{ userId: 'u1', emoji: '🔥' }] as never },
    });
    expect(merged).toHaveLength(2);
    expect(merged[0].userNote).toBe('note');
    expect(merged[0].reactions).toHaveLength(1);
    expect(merged[1].name).toBe('B');
  });

  it('returns same array reference when nothing to merge', () => {
    const games = [{ id: 'g1' } as Game];
    expect(mergeEnrichmentOntoGames(games, {})).toBe(games);
  });

  it('patches cache after successful enrichment', async () => {
    const client = new QueryClient();
    const key = ['games', 'available', 'h'] as const;
    const page: AvailableGamesPage = {
      games: [{ id: 'g1', name: 'A' } as Game],
      meta: EMPTY_AVAILABLE_META,
    };
    client.setQueryData(key, page);
    getAvailableGamesEnrichment.mockResolvedValue({
      data: { byGameId: { g1: { userNote: 'n1' } } },
    });

    await attachAvailableGamesEnrichment(client, key, page.games);

    const next = client.getQueryData(key) as AvailableGamesPage;
    expect(next.games[0].userNote).toBe('n1');
    expect(next.games).toHaveLength(1);
  });

  it('leaves core cache intact when enrichment request fails', async () => {
    const client = new QueryClient();
    const key = ['games', 'available', 'h'] as const;
    const page: AvailableGamesPage = {
      games: [{ id: 'g1', name: 'core' } as Game],
      meta: EMPTY_AVAILABLE_META,
    };
    client.setQueryData(key, page);
    getAvailableGamesEnrichment.mockRejectedValue(new Error('enrich down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await attachAvailableGamesEnrichment(client, key, page.games);

    expect(client.getQueryData(key)).toEqual(page);
    warn.mockRestore();
  });
});
