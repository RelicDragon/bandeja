// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolMember } from '@/api/playIntents';

const counters = vi.hoisted(() => ({ pulseRenders: 0 }));
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/playIntent/CourtLobbyPulseRing', () => ({
  CourtLobbyPulseRing: () => {
    counters.pulseRenders += 1;
    return null;
  },
}));

vi.mock('@/components/playIntent/CourtLobbySportCourt', () => ({
  CourtLobbySportCourt: () => null,
}));

vi.mock('@/components/playIntent/CourtLobbyThunder', () => ({
  CourtLobbyThunder: () => null,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (
    selector: (state: {
      user: {
        id: string;
        firstName: string;
        lastName: string;
        avatar: null;
      };
    }) => unknown,
  ) =>
    selector({
      user: {
        id: 'viewer',
        firstName: 'Viewer',
        lastName: 'Player',
        avatar: null,
      },
    }),
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (
    selector: (state: { isFavorite: () => boolean }) => unknown,
  ) => selector({ isFavorite: () => false }),
}));

const members: PoolMember[] = [
  {
    userId: 'u1',
    intentId: 'i1',
    firstName: 'One',
    lastName: 'Player',
    avatar: null,
    level: 3,
    affinity: 'near',
    affinityScore: 7,
    status: 'OPEN',
    busyInGame: false,
    inProposal: false,
    eligibleForProposal: true,
  },
  {
    userId: 'u2',
    intentId: 'i2',
    firstName: 'Two',
    lastName: 'Player',
    avatar: null,
    level: 3.5,
    affinity: 'mid',
    affinityScore: 3,
    status: 'OPEN',
    busyInGame: false,
    inProposal: false,
    eligibleForProposal: false,
  },
];

describe('CourtLobbyArena refresh stability', () => {
  afterEach(() => {
    counters.pulseRenders = 0;
  });

  it('does not re-render for a semantically identical cloned pool snapshot', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    const { CourtLobbyArena } = await import('./CourtLobbyArena');
    const container = document.createElement('div');
    const root = createRoot(container);
    const onAvatarClick = vi.fn();
    const props = {
      members,
      overflow: 0,
      busy: false,
      hasProposal: true,
      vacancy: 1,
      rosterLocked: false,
      sport: 'PADEL' as const,
      partySize: 4,
      onAvatarClick,
    };

    await act(async () => {
      root.render(<CourtLobbyArena {...props} />);
    });
    const rendersAfterFirstSnapshot = counters.pulseRenders;

    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={members.map((member) => ({ ...member }))}
        />,
      );
    });

    expect(counters.pulseRenders).toBe(rendersAfterFirstSnapshot);

    await act(async () => {
      root.render(
        <CourtLobbyArena
          {...props}
          members={members.map((member, index) =>
            index === 1
              ? { ...member, eligibleForProposal: true }
              : { ...member },
          )}
        />,
      );
    });

    expect(counters.pulseRenders).toBeGreaterThan(rendersAfterFirstSnapshot);

    await act(async () => root.unmount());
  });
});
