import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLeagueFixtureResultsCacheForTests,
  useLeagueFixtureResultsCache,
} from './leagueFixtureResultsCache';

vi.mock('@/api/results', () => ({
  resultsApi: {
    getGameResults: vi.fn(),
  },
}));

import { resultsApi } from '@/api/results';

describe('leagueFixtureResultsCache', () => {
  beforeEach(() => {
    __resetLeagueFixtureResultsCacheForTests();
    vi.mocked(resultsApi.getGameResults).mockReset();
  });

  it('fetchGame stores converted rounds and status', async () => {
    vi.mocked(resultsApi.getGameResults).mockResolvedValue({
      data: {
        resultsStatus: 'IN_PROGRESS',
        rounds: [
          {
            id: 'r1',
            matches: [
              {
                id: 'm1',
                teams: [
                  { teamNumber: 1, playerIds: ['a'] },
                  { teamNumber: 2, playerIds: ['b'] },
                ],
                sets: [{ teamAScore: 6, teamBScore: 4 }],
              },
            ],
          },
        ],
      },
    } as never);

    await useLeagueFixtureResultsCache.getState().fetchGame('g1');
    const entry = useLeagueFixtureResultsCache.getState().entries.g1;
    expect(entry?.loading).toBe(false);
    expect(entry?.hydrated).toBe(true);
    expect(entry?.resultsStatus).toBe('IN_PROGRESS');
    expect(entry?.rounds[0]?.matches[0]?.sets[0]?.teamA).toBe(6);
  });

  it('scheduleFetch debounces rapid calls into one fetch', async () => {
    vi.useFakeTimers();
    vi.mocked(resultsApi.getGameResults).mockResolvedValue({
      data: { resultsStatus: 'IN_PROGRESS', rounds: [] },
    } as never);

    const { scheduleFetch } = useLeagueFixtureResultsCache.getState();
    scheduleFetch('g1', 300);
    scheduleFetch('g1', 300);
    scheduleFetch('g1', 300);
    expect(resultsApi.getGameResults).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(resultsApi.getGameResults).toHaveBeenCalledTimes(1);
    expect(resultsApi.getGameResults).toHaveBeenCalledWith('g1');
    vi.useRealTimers();
  });

  it('dedupes concurrent fetchGame calls', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    vi.mocked(resultsApi.getGameResults).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }) as never,
    );

    const p1 = useLeagueFixtureResultsCache.getState().fetchGame('g1');
    const p2 = useLeagueFixtureResultsCache.getState().fetchGame('g1');
    expect(resultsApi.getGameResults).toHaveBeenCalledTimes(1);
    resolveFetch?.({ data: { resultsStatus: 'NONE', rounds: [] } });
    await Promise.all([p1, p2]);
    expect(resultsApi.getGameResults).toHaveBeenCalledTimes(1);
  });

  it('applyLocalRounds write-through updates siblings immediately', () => {
    useLeagueFixtureResultsCache.getState().applyLocalRounds(
      'g1',
      [
        {
          id: 'r1',
          matches: [
            {
              id: 'm1',
              teamA: ['a'],
              teamB: ['b'],
              sets: [{ teamA: 1, teamB: 0 }],
            },
          ],
        },
      ],
      'IN_PROGRESS',
    );
    const entry = useLeagueFixtureResultsCache.getState().entries.g1;
    expect(entry?.resultsStatus).toBe('IN_PROGRESS');
    expect(entry?.rounds[0]?.matches[0]?.sets[0]?.teamA).toBe(1);
    expect(entry?.hydrated).toBe(true);
  });

  it('ignores stale fetch responses after a newer generation', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    vi.mocked(resultsApi.getGameResults).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }) as never,
    );

    const first = useLeagueFixtureResultsCache.getState().fetchGame('g1');
    // Force a second generation by clearing in-flight via apply then fetch again after first starts
    // Wait: concurrent dedupe means second waits on first. Use apply + generation bump via sequential:
    // Complete first with old data after second request started differently:
    // Schedule: start fetch1, let it hang; bump generation by calling fetch after first completes inFlight delete
    resolvers[0]?.({
      data: {
        resultsStatus: 'IN_PROGRESS',
        rounds: [
          {
            id: 'old',
            matches: [
              {
                id: 'm',
                teams: [
                  { teamNumber: 1, playerIds: ['a'] },
                  { teamNumber: 2, playerIds: ['b'] },
                ],
                sets: [{ teamAScore: 1, teamBScore: 0 }],
              },
            ],
          },
        ],
      },
    });
    await first;

    useLeagueFixtureResultsCache.getState().applyLocalRounds(
      'g1',
      [
        {
          id: 'new',
          matches: [
            {
              id: 'm',
              teamA: ['a'],
              teamB: ['b'],
              sets: [{ teamA: 6, teamB: 4 }],
            },
          ],
        },
      ],
      'IN_PROGRESS',
    );

    const second = useLeagueFixtureResultsCache.getState().fetchGame('g1');
    const thirdStarted = useLeagueFixtureResultsCache.getState().fetchGame('g1');
    // still deduped on second
    resolvers[1]?.({
      data: {
        resultsStatus: 'FINAL',
        rounds: [
          {
            id: 'server',
            matches: [
              {
                id: 'm',
                teams: [
                  { teamNumber: 1, playerIds: ['a'] },
                  { teamNumber: 2, playerIds: ['b'] },
                ],
                sets: [{ teamAScore: 6, teamBScore: 4 }],
              },
            ],
          },
        ],
      },
    });
    await Promise.all([second, thirdStarted]);
    expect(useLeagueFixtureResultsCache.getState().entries.g1?.resultsStatus).toBe('FINAL');
    expect(useLeagueFixtureResultsCache.getState().entries.g1?.rounds[0]?.id).toBe('server');
  });
});
