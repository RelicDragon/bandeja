// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MatchProposalSummary,
  PlayIntent,
  PoolMember,
} from '@/api/playIntents';

const mocks = vi.hoisted(() => ({
  declineProposal: vi.fn().mockResolvedValue({ declined: true }),
  fetchFavorites: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
  onChanged: vi.fn(),
  onOpenChange: vi.fn(),
  t: vi.fn((key: string) => key),
}));

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DrawerCloseButton: () => <button type="button">close</button>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/GameDetails/PlayersCarousel', () => ({
  PlayersCarousel: ({
    participants,
    emptySlots,
    onRemoveParticipant,
    canRemoveParticipant,
  }: {
    participants: { userId: string }[];
    emptySlots: number;
    onRemoveParticipant?: (userId: string) => void;
    canRemoveParticipant?: (userId: string) => boolean;
  }) => (
    <div
      data-testid="ready-roster"
      data-player-ids={participants.map((participant) => participant.userId).join(',')}
      data-empty-slots={emptySlots}
    >
      {participants
        .filter((participant) => canRemoveParticipant?.(participant.userId))
        .map((participant) => (
          <button
            key={participant.userId}
            type="button"
            data-remove-player={participant.userId}
            onClick={() => onRemoveParticipant?.(participant.userId)}
          >
            remove
          </button>
        ))}
    </div>
  ),
}));

vi.mock('@/components/playIntent/PlayIntentClusterProgress', () => ({
  PlayIntentClusterProgress: () => null,
}));

vi.mock('@/components/playIntent/CourtLobbyArena', () => ({
  CourtLobbyArena: ({ members }: { members: PoolMember[] }) => (
    <div
      data-testid="court-selection"
      data-selected-player-ids={members
        .filter((member) => member.inProposal)
        .map((member) => member.userId)
        .join(',')}
    />
  ),
}));

vi.mock('@/components/sport/SportPublicIcon', () => ({
  SportPublicIcon: () => null,
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard: vi.fn() }),
}));

vi.mock('@/store/favoritesStore', () => ({
  useFavoritesStore: (
    selector: (state: { fetchFavorites: typeof mocks.fetchFavorites }) => unknown,
  ) => selector({ fetchFavorites: mocks.fetchFavorites }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (
    selector: (state: { user: { id: string } }) => unknown,
  ) => selector({ user: { id: 'viewer' } }),
}));

vi.mock('@/api/playIntents', () => ({
  playIntentsApi: {
    addProposalMember: vi.fn(),
    removeProposalMember: vi.fn(),
    confirmProposal: vi.fn(),
    declineProposal: mocks.declineProposal,
  },
}));

const proposal: MatchProposalSummary = {
  id: 'proposal-1',
  status: 'PENDING',
  hostUserId: null,
  gameId: null,
  dateKeys: ['2026-07-30'],
  startTime: '18:00',
  endTime: '19:30',
  clubIds: [],
  suggestedStartTime: null,
  expiresAt: '2026-07-30T18:00:00.000Z',
  members: [
    {
      userId: 'viewer',
      intentId: 'intent-viewer',
      isHost: false,
      response: 'PENDING',
      firstName: 'Viewer',
      lastName: 'Player',
      avatar: null,
      level: 3,
    },
    ...['two', 'three', 'four'].map((id) => ({
      userId: id,
      intentId: `intent-${id}`,
      isHost: false,
      response: 'PENDING',
      firstName: id,
      lastName: 'Player',
      avatar: null,
      level: 3,
    })),
  ],
};

const intent: PlayIntent = {
  id: 'intent-viewer',
  cityId: 'city-1',
  sport: 'PADEL',
  entityType: 'GAME',
  dateKeys: ['2026-07-30'],
  timeOfDay: 'EVENING',
  startTime: null,
  endTime: null,
  clubIds: ['club-1'],
  minLevel: 2.5,
  maxLevel: 4,
  genderTeams: 'ANY',
  status: 'OPEN',
  expiresAt: '2026-07-30T23:59:59.000Z',
};

const freeMembers: PoolMember[] = ['two', 'three', 'four'].map((id, index) => ({
  userId: id,
  intentId: `intent-${id}`,
  firstName: id,
  lastName: 'Player',
  avatar: null,
  level: 3,
  affinity: index === 2 ? 'mid' : 'near',
  affinityScore: 10 - index,
  status: 'MATCHED',
  busyInGame: false,
  inProposal: false,
  eligibleForProposal: false,
}));

describe('CourtLobbySheet proposal dismissal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps the ready proposal available after choosing Not now', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    const render = (open: boolean) => (
      <CourtLobbyPanel
        open={open}
        onOpenChange={mocks.onOpenChange}
        members={[]}
        overflow={0}
        partySize={4}
        availableCount={0}
        clusterProgress={4}
        sport="PADEL"
        proposal={proposal}
        onChanged={mocks.onChanged}
      />
    );

    await act(async () => root.render(render(true)));

    const notNow = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'playIntent.decline',
    );
    expect(notNow).toBeDefined();

    await act(async () => {
      notNow?.click();
      await Promise.resolve();
    });

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.declineProposal).not.toHaveBeenCalled();
    expect(mocks.onChanged).not.toHaveBeenCalled();

    await act(async () => root.render(render(false)));
    await act(async () => root.render(render(true)));

    expect(container.textContent).toContain('playIntent.createGame');
  });

  it('can create from a ready lobby even when players have other pending proposals', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');

    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={freeMembers}
          overflow={0}
          partySize={4}
          availableCount={3}
          clusterProgress={4}
          sport="PADEL"
          intent={intent}
          proposal={null}
          onChanged={mocks.onChanged}
        />,
      );
    });

    const createGame = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('playIntent.createGame'),
    );
    expect(createGame).toBeDefined();
    expect(
      container.querySelector('[data-testid="match-editor"]')?.contains(createGame ?? null),
    ).toBe(true);
    expect(mocks.t).toHaveBeenCalledWith('playIntent.readyCreateHint', { count: 3 });

    await act(async () => {
      createGame?.click();
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/create-game',
      expect.objectContaining({
        state: expect.objectContaining({
          entityType: 'GAME',
          invitedPlayerIds: ['two', 'three', 'four'],
        }),
      }),
    );
  });

  it('shows and creates a partial match with one compatible free player', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');

    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={[freeMembers[0]]}
          overflow={0}
          partySize={4}
          availableCount={1}
          clusterProgress={2}
          sport="PADEL"
          intent={intent}
          proposal={null}
          onChanged={mocks.onChanged}
        />,
      );
    });

    const roster = container.querySelector('[data-testid="ready-roster"]');
    expect(roster?.getAttribute('data-player-ids')).toBe('viewer,two');
    expect(roster?.getAttribute('data-empty-slots')).toBe('2');
    const court = container.querySelector('[data-testid="court-selection"]');
    expect(court?.getAttribute('data-selected-player-ids')).toBe('two');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-remove-player="two"]')?.click();
    });

    expect(roster?.getAttribute('data-player-ids')).toBe('viewer');
    expect(roster?.getAttribute('data-empty-slots')).toBe('3');
    expect(court?.getAttribute('data-selected-player-ids')).toBe('');

    const createGame = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('playIntent.createGame'),
    );
    expect(createGame).toBeDefined();
    expect(
      container.querySelector('[data-testid="match-editor"]')?.contains(createGame ?? null),
    ).toBe(true);

    await act(async () => {
      createGame?.click();
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/create-game',
      expect.objectContaining({
        state: expect.objectContaining({
          invitedPlayerIds: [],
        }),
      }),
    );
  });
});
