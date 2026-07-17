// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameFilters } from './useGameFilters';
import { useShellNavStore } from '@/store/shellNavStore';
import { getGameFilters, setGameFilters, type GameFilters } from '@/utils/gameFiltersStorage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const idbStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
}));

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useGameFilters>) => void }) {
  const api = useGameFilters();
  onReady(api);
  return null;
}

describe('useGameFilters persistence', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useGameFilters> | null;

  beforeEach(() => {
    idbStore.clear();
    useShellNavStore.setState({
      findViewMode: 'calendar',
      findSelectedDay: null,
      findListWeekStartDay: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(() => {
    try {
      act(() => {
        root.unmount();
      });
    } catch {
      // already unmounted by test
    }
    container.remove();
  });

  async function mountHook() {
    await act(async () => {
      root.render(
        <Probe
          onReady={(api) => {
            latest = api;
          }}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('restores entity/level filters after remount (reload seam)', async () => {
    const saved: GameFilters = {
      filterAvailableSlots: true,
      filterSuitableRating: false,
      hideBarGames: true,
      gameFilter: true,
      trainingFilter: false,
      tournamentFilter: false,
      leaguesFilter: false,
      activeTab: 'calendar',
      filtersPanelOpen: false,
      filterClubIds: [],
      filterTimeStart: '00:00',
      filterTimeEnd: '24:00',
      filterLevelMin: 2.5,
      filterLevelMax: 5.5,
      filterSport: 'primary',
      filterNoRating: false,
      showPrivateGames: false,
      calendarSelectedDate: new Date().toISOString(),
      dateSavedAt: Date.now(),
    };
    await setGameFilters(saved);

    await mountHook();
    expect(latest?.isHydrated).toBe(true);
    expect(latest?.filters.gameFilter).toBe(true);
    expect(latest?.filters.filterLevelMin).toBe(2.5);
    expect(latest?.filters.filterLevelMax).toBe(5.5);
    expect(latest?.filters.hideBarGames).toBe(true);
    expect(latest?.filters.filterAvailableSlots).toBe(true);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    useShellNavStore.setState({ findSelectedDay: null, findListWeekStartDay: null });

    await mountHook();
    const stored = await getGameFilters();
    expect(stored.gameFilter).toBe(true);
    expect(stored.filterLevelMin).toBe(2.5);
    expect(stored.filterLevelMax).toBe(5.5);
    expect(stored.hideBarGames).toBe(true);
    expect(latest?.filters.gameFilter).toBe(true);
  });

  it('does not overwrite stored filters with defaults when restoring calendar day', async () => {
    const saved: GameFilters = {
      filterAvailableSlots: false,
      filterSuitableRating: false,
      hideBarGames: false,
      gameFilter: true,
      trainingFilter: false,
      tournamentFilter: false,
      leaguesFilter: false,
      activeTab: 'calendar',
      filtersPanelOpen: false,
      filterClubIds: ['club-1'],
      filterTimeStart: '08:00',
      filterTimeEnd: '12:00',
      filterLevelMin: 3,
      filterLevelMax: 4,
      filterSport: 'primary',
      filterNoRating: true,
      showPrivateGames: false,
      calendarSelectedDate: new Date('2026-07-17T10:00:00.000Z').toISOString(),
      dateSavedAt: Date.now(),
    };
    await setGameFilters(saved);

    await mountHook();
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    const stored = await getGameFilters();
    expect(stored.gameFilter).toBe(true);
    expect(stored.filterLevelMin).toBe(3);
    expect(stored.filterLevelMax).toBe(4);
    expect(stored.filterClubIds).toEqual(['club-1']);
    expect(stored.filterTimeStart).toBe('08:00');
    expect(stored.filterNoRating).toBe(true);
  });

  it('persists filter toggle even if tab unmounts before save effect flush', async () => {
    await mountHook();
    expect(latest?.isHydrated).toBe(true);

    act(() => {
      latest!.updateFilters({
        gameFilter: true,
        trainingFilter: false,
        filterLevelMin: 2.5,
        filterLevelMax: 5.5,
        hideBarGames: true,
      });
      root.unmount();
    });

    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });

    const stored = await getGameFilters();
    expect(stored.gameFilter).toBe(true);
    expect(stored.filterLevelMin).toBe(2.5);
    expect(stored.filterLevelMax).toBe(5.5);
    expect(stored.hideBarGames).toBe(true);
  });

  it('survives tab remount while findSelectedDay already set (SPA navigate away/back)', async () => {
    const saved: GameFilters = {
      filterAvailableSlots: true,
      filterSuitableRating: true,
      hideBarGames: true,
      gameFilter: false,
      trainingFilter: true,
      tournamentFilter: false,
      leaguesFilter: false,
      activeTab: 'list',
      filtersPanelOpen: true,
      filterClubIds: ['c1'],
      filterTimeStart: '09:00',
      filterTimeEnd: '18:00',
      filterLevelMin: 2,
      filterLevelMax: 6,
      filterSport: 'primary',
      filterNoRating: false,
      showPrivateGames: false,
    };
    await setGameFilters(saved);
    useShellNavStore.setState({
      findViewMode: 'list',
      findSelectedDay: '2026-07-17',
      findListWeekStartDay: '2026-07-13',
    });

    await mountHook();
    expect(latest?.filters.trainingFilter).toBe(true);
    expect(latest?.filters.filterAvailableSlots).toBe(true);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);

    await mountHook();
    expect(latest?.filters.trainingFilter).toBe(true);
    expect(latest?.filters.filterLevelMin).toBe(2);
    expect(latest?.filters.filterClubIds).toEqual(['c1']);
    expect(latest?.filters.filtersPanelOpen).toBe(true);

    const stored = await getGameFilters();
    expect(stored.trainingFilter).toBe(true);
    expect(stored.filterAvailableSlots).toBe(true);
    expect(stored.hideBarGames).toBe(true);
  });
});
