// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameFilters } from './useGameFilters';
import { useShellNavStore } from '@/store/shellNavStore';
import {
  resetGameFiltersMemoryCacheForTests,
  setGameFilters,
  type GameFilters,
} from '@/utils/gameFiltersStorage';

/**
 * Find's view mode used to be restored from storage inside AvailableGamesSection,
 * which only won over `useUrlStoreSync` because it happened to resolve later (an
 * async storage read landing after the effect that writes a default `calendar`).
 * The rule is now explicit and lives here: an explicit `?view=` wins, otherwise
 * the stored mode is restored.
 */

const idbStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
}));

function Probe() {
  useGameFilters();
  return null;
}

function savedFilters(activeTab: 'calendar' | 'list'): GameFilters {
  return {
    filterAvailableSlots: false,
    filterSuitableRating: false,
    hideBarGames: false,
    gameFilter: false,
    trainingFilter: false,
    tournamentFilter: false,
    leaguesFilter: false,
    eventsFilter: false,
    activeTab,
    filtersPanelOpen: false,
    filterClubIds: [],
    filterTimeStart: '00:00',
    filterTimeEnd: '24:00',
    filterLevelMin: 1,
    filterLevelMax: 7,
    filterSport: 'primary',
    filterNoRating: false,
    showPrivateGames: false,
  };
}

describe('useGameFilters view-mode restore', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    idbStore.clear();
    resetGameFiltersMemoryCacheForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    try {
      act(() => root.unmount());
    } catch {
      // already unmounted
    }
    container.remove();
    window.history.replaceState({}, '', '/');
  });

  async function mountAt(url: string) {
    window.history.replaceState({}, '', url);
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it('restores the stored mode when the URL names no view', async () => {
    await setGameFilters(savedFilters('list'));
    useShellNavStore.setState({ findViewMode: 'calendar', findSelectedDay: null });

    await mountAt('/find');

    expect(useShellNavStore.getState().findViewMode).toBe('list');
  });

  it('leaves an explicit ?view= in charge', async () => {
    // Storage says list, the link says calendar — the link wins.
    await setGameFilters(savedFilters('list'));
    useShellNavStore.setState({ findViewMode: 'calendar', findSelectedDay: null });

    await mountAt('/find?view=calendar');

    expect(useShellNavStore.getState().findViewMode).toBe('calendar');
  });

  it('does not force calendar over a stored list when other params are present', async () => {
    await setGameFilters(savedFilters('list'));
    useShellNavStore.setState({ findViewMode: 'calendar', findSelectedDay: null });

    await mountAt('/find?tab=search');

    expect(useShellNavStore.getState().findViewMode).toBe('list');
  });

  it('restores a stored calendar mode over a list default', async () => {
    await setGameFilters(savedFilters('calendar'));
    useShellNavStore.setState({ findViewMode: 'list', findSelectedDay: null });

    await mountAt('/find');

    expect(useShellNavStore.getState().findViewMode).toBe('calendar');
  });
});
