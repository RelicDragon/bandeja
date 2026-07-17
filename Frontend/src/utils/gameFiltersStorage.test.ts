import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGameFilters,
  peekGameFiltersMemory,
  resetGameFiltersMemoryCacheForTests,
  setGameFilters,
  type GameFilters,
} from './gameFiltersStorage';

const idbStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    await new Promise((r) => setTimeout(r, 5));
    idbStore.set(key, value);
  }),
}));

const base = (overrides: Partial<GameFilters> = {}): GameFilters => ({
  filterAvailableSlots: false,
  filterSuitableRating: false,
  hideBarGames: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  activeTab: 'calendar',
  filtersPanelOpen: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1,
  filterLevelMax: 7,
  ...overrides,
});

describe('gameFiltersStorage', () => {
  beforeEach(() => {
    idbStore.clear();
    resetGameFiltersMemoryCacheForTests();
  });

  it('round-trips entity and panel filters', async () => {
    await setGameFilters(
      base({
        gameFilter: true,
        filterLevelMin: 2.5,
        filterLevelMax: 5.5,
        hideBarGames: true,
      }),
    );
    const loaded = await getGameFilters();
    expect(loaded.gameFilter).toBe(true);
    expect(loaded.filterLevelMin).toBe(2.5);
    expect(loaded.filterLevelMax).toBe(5.5);
    expect(loaded.hideBarGames).toBe(true);
  });

  it('latest write wins when older set is still in flight', async () => {
    const first = setGameFilters(base({ gameFilter: false, filterLevelMin: 1 }));
    const second = setGameFilters(base({ gameFilter: true, filterLevelMin: 3 }));
    await Promise.all([first, second]);
    const loaded = await getGameFilters();
    expect(loaded.gameFilter).toBe(true);
    expect(loaded.filterLevelMin).toBe(3);
  });

  it('keeps memory snapshot across slow IDB so game→Back reads the latest total state', async () => {
    const write = setGameFilters(
      base({
        filterAvailableSlots: false,
        filterSuitableRating: false,
        hideBarGames: false,
        gameFilter: false,
        trainingFilter: false,
        filterLevelMin: 1,
        filterLevelMax: 7,
        filterClubIds: [],
      }),
    );
    expect(peekGameFiltersMemory()?.filterLevelMin).toBe(1);
    expect(peekGameFiltersMemory()?.gameFilter).toBe(false);

    const loadedWhileWriting = await getGameFilters();
    expect(loadedWhileWriting.gameFilter).toBe(false);
    expect(loadedWhileWriting.filterLevelMin).toBe(1);
    await write;
  });
});
