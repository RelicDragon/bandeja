// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard: vi.fn() }),
}));

vi.mock('@/hooks/usePresenceSubscription', () => ({
  usePresenceSubscription: () => {},
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector?: (s: { user: null }) => unknown) =>
    selector ? selector({ user: null }) : { user: null },
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (selector: (s: { isFavorite: () => boolean }) => unknown) =>
    selector({ isFavorite: () => false }),
}));

vi.mock('@/store/presenceStore', () => ({
  usePresenceStore: (selector: (s: { isOnline: () => boolean }) => unknown) =>
    selector({ isOnline: () => false }),
}));

vi.mock('@/components/ui/Dialog', () => ({
  Dialog: () => null,
  DialogContent: () => null,
}));

vi.mock('@/components/GameDetails/PublicGamePrompt', () => ({
  PublicGamePrompt: () => null,
}));

import { PlayerAvatar } from './PlayerAvatar';
import { Sports, type Sport } from '@shared/sport';

/** Table-tennis primary player who also plays padel — the reported bug scenario. */
const dualSportPlayer = {
  id: 'u1',
  firstName: 'Ann',
  lastName: 'Bee',
  primarySport: Sports.TABLE_TENNIS,
  sportsEnabled: [Sports.TABLE_TENNIS, Sports.PADEL],
  sportProfiles: [
    { sport: Sports.PADEL, level: 2.7, reliability: 50, gamesPlayed: 3, gamesWon: 1 },
    { sport: Sports.TABLE_TENNIS, level: 3.5, reliability: 60, gamesPlayed: 5, gamesWon: 2 },
  ],
} as unknown as BasicUser;

const tableTennisOnlyPlayer = {
  id: 'u2',
  firstName: 'Cee',
  lastName: 'Dee',
  primarySport: Sports.TABLE_TENNIS,
  sportsEnabled: [Sports.TABLE_TENNIS],
  sportProfiles: [
    { sport: Sports.TABLE_TENNIS, level: 3.5, reliability: 60, gamesPlayed: 5, gamesWon: 2 },
  ],
} as unknown as BasicUser;

describe('PlayerAvatar level badge sport', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  function renderAvatar(player: BasicUser, levelSport?: Sport) {
    act(() => {
      root!.render(
        <PlayerAvatar
          player={player}
          smallLayout
          showName={false}
          fullHideName
          levelSport={levelSport}
        />
      );
    });
  }

  it('shows the level for the explicitly requested sport, not the player primary', () => {
    renderAvatar(dualSportPlayer, Sports.PADEL);
    expect(container.textContent).toContain('2.7');
    expect(container.textContent).not.toContain('3.5');
  });

  it('shows a gray dash badge when the player does not have the requested sport', () => {
    renderAvatar(tableTennisOnlyPlayer, Sports.PADEL);
    const dashBadge = container.querySelector('.bg-gray-500');
    expect(dashBadge).not.toBeNull();
    expect(dashBadge!.textContent).toBe('-');
    expect(container.textContent).not.toContain('3.5');
  });

  it('still defaults to the player primary sport when no sport is passed', () => {
    renderAvatar(dualSportPlayer, undefined);
    expect(container.textContent).toContain('3.5');
  });
});
