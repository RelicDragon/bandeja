import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { GAME_CARD_ENRICHMENT_KEYS } from '@/types/gameCardEnrichment';
import type { GameCardEnrichment } from '@/types/gameCardEnrichment';
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

  /**
   * Regression for the BLOCKER where the merge copied three of nine fields and
   * threw the six PRD 345–357 card payloads away. `format: 'card'` list queries
   * skip inline enrichment, so this endpoint is the only source for them.
   *
   * The fixture is keyed by `GameCardEnrichmentKey`: adding a field to the
   * shared contract without a value here is a type error, and the assertion
   * walks `GAME_CARD_ENRICHMENT_KEYS` so field ten cannot be dropped silently.
   */
  it('carries every field of the shared enrichment contract', () => {
    const patch: Required<GameCardEnrichment> = {
      userNote: 'Bring balls',
      weatherSummary: { temperatureC: 21, conditionKey: 'clear' } as Required<
        GameCardEnrichment
      >['weatherSummary'],
      reactions: [{ userId: 'u1', emoji: '🔥' }],
      spotOpenedAt: '2026-05-21T16:30:00.000Z',
      liveSummary: { matchId: 'm1', currentSet: 1, sides: [] } as unknown as Required<
        GameCardEnrichment
      >['liveSummary'],
      weatherRisk: { severity: 'likely', pop: 70, windKph: 12, at: '2026-05-21T17:00:00.000Z' },
      perHeadPrice: {
        amountCents: 1000,
        currency: 'EUR',
        totalCents: 4000,
        payerCount: 4,
        estimated: true,
      },
      seriesLabel: {
        seriesId: 's1',
        name: 'Tuesday Regulars',
        cadence: 'WEEKLY',
        weekday: 2,
        startTimeLocal: '19:00',
      },
      attendanceSummary: {
        confirmedCount: 2,
        unsureCount: 0,
        unansweredCount: 2,
        playingCount: 4,
        viewerAttendance: 'CONFIRMED',
      },
    };

    const [merged] = mergeEnrichmentOntoGames([{ id: 'g1' } as Game], { g1: patch });

    for (const key of GAME_CARD_ENRICHMENT_KEYS) {
      expect(merged[key], `enrichment field "${key}" was dropped by the merge`).toEqual(patch[key]);
    }
  });

  it('leaves untouched fields alone and skips an empty patch', () => {
    const games = [{ id: 'g1', userNote: 'kept' } as Game];
    const merged = mergeEnrichmentOntoGames(games, {
      g1: { seriesLabel: null, weatherRisk: null },
    });
    expect(merged[0].userNote).toBe('kept');
    expect(merged[0].seriesLabel).toBeNull();
    expect(merged[0].weatherRisk).toBeNull();
    expect(mergeEnrichmentOntoGames(games, { g1: {} })).toBe(games);
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

  it('retries weather enrichment until summary lands or delays exhaust', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = ['games', 'available', 'h'] as const;
    const page: AvailableGamesPage = {
      games: [{ id: 'g1', name: 'A', timeIsSet: true } as Game],
      meta: EMPTY_AVAILABLE_META,
    };
    client.setQueryData(key, page);
    getAvailableGamesEnrichment
      .mockResolvedValueOnce({
        data: { byGameId: { g1: { weatherSummary: null, reactions: [] } } },
      })
      .mockResolvedValueOnce({
        data: { byGameId: { g1: { weatherSummary: null, reactions: [] } } },
      })
      .mockResolvedValueOnce({
        data: {
          byGameId: {
            g1: {
              weatherSummary: { temperatureC: 22, conditionKey: 'clear' },
              reactions: [],
            },
          },
        },
      });

    const { AVAILABLE_WEATHER_RETRY_DELAYS_MS } = await import('./attachAvailableGamesEnrichment');
    await attachAvailableGamesEnrichment(client, key, page.games);
    expect(getAvailableGamesEnrichment).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AVAILABLE_WEATHER_RETRY_DELAYS_MS[0]);
    await Promise.resolve();
    expect(getAvailableGamesEnrichment).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(AVAILABLE_WEATHER_RETRY_DELAYS_MS[1]);
    await Promise.resolve();
    expect(getAvailableGamesEnrichment).toHaveBeenCalledTimes(3);

    const next = client.getQueryData(key) as AvailableGamesPage;
    expect(next.games[0].weatherSummary).toMatchObject({ temperatureC: 22 });
    vi.useRealTimers();
  });
});
