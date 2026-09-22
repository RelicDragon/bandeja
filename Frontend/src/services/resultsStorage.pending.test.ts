import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => disk.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { disk.set(key, structuredClone(value)); }),
  del: vi.fn(async (key: string) => { disk.delete(key); }),
}));
import { ResultsStorage } from './resultsStorage';

describe('results draft recovery after app restart', () => {
  beforeEach(() => { disk.clear(); ResultsStorage.clearCache(); });

  it('recovers an unacknowledged score without waiting for a network error flag', async () => {
    await ResultsStorage.saveResults({ gameId: 'game', rounds: [], resultsVersion: 'original-version', hasUnsyncedChanges: true });
    ResultsStorage.clearCache();
    expect(await ResultsStorage.getServerProblem('game')).toBe(true);
    expect((await ResultsStorage.getResults('game'))?.resultsVersion).toBe('original-version');
    // An unrelated clear of the old separate flag must not acknowledge this draft.
    await ResultsStorage.setServerProblem('game', false);
    expect(await ResultsStorage.getServerProblem('game')).toBe(true);
    await ResultsStorage.saveResults({ gameId: 'game', rounds: [], resultsVersion: 'acknowledged-version' });
    ResultsStorage.clearCache();
    expect(await ResultsStorage.getServerProblem('game')).toBe(false);
  });
});
