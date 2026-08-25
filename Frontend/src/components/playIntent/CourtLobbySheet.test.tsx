// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MatchProposalSummary,
  MatchingLobbyGame,
  PlayIntent,
  PoolMember,
} from '@/api/playIntents';

const mocks = vi.hoisted(() => ({
  declineProposal: vi.fn().mockResolvedValue({ declined: true }),
  confirmProposal: vi.fn(),
  discussGroup: vi.fn().mockResolvedValue({ id: 'group-1' }),
  fetchFavorites: vi.fn().mockResolvedValue(undefined),
  getOrCreateAndAddUserChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
  navigate: vi.fn(),
  onChanged: vi.fn(),
  onOpenChange: vi.fn(),
  t: vi.fn((key: string) => key),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  joinGame: vi.fn(),
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
  default: { error: mocks.toastError, success: mocks.toastSuccess },
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
  PlayIntentClusterProgress: ({ current, needed }: { current: number; needed: number }) => (
    <div
      data-testid="play-intent-cluster-progress"
      data-current={current}
      data-needed={needed}
    />
  ),
}));

vi.mock('@/components/playIntent/CourtLobbyArena', () => ({
  CourtLobbyArena: ({
    members,
    matchingGames = [],
    onAvatarClick,
    onJoinGame,
  }: {
    members: PoolMember[];
    matchingGames?: MatchingLobbyGame[];
    onAvatarClick: (member: PoolMember) => void;
    onJoinGame?: (game: MatchingLobbyGame) => void;
  }) => (
    <div
      data-testid="court-selection"
      data-selected-player-ids={members
        .filter((member) => member.inProposal)
        .map((member) => member.userId)
        .join(',')}
      data-matching-game-ids={matchingGames.map((game) => game.id).join(',')}
    >
      {members.map((member) => (
        <button
          key={member.userId}
          type="button"
          data-pool-member={member.userId}
          onClick={() => onAvatarClick(member)}
        >
          {member.userId}
        </button>
      ))}
      {matchingGames.map((game) => (
        <button
          key={game.id}
          type="button"
          data-matching-game={game.id}
          data-join={game.allowDirectJoin ? 'direct' : 'queue'}
          onClick={() => {
            void onJoinGame?.(game);
          }}
        >
          {game.id}
        </button>
      ))}
    </div>
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

vi.mock('@/store/authStore', () => {
  const state = {
    user: {
      id: 'viewer',
      nameIsSet: true,
      currentCity: { timezone: 'Europe/Prague' },
    },
  };
  return {
    useAuthStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

vi.mock('@/store/playersStore', () => ({
  usePlayersStore: Object.assign(
    () => ({
      getOrCreateAndAddUserChat: mocks.getOrCreateAndAddUserChat,
    }),
    {
      getState: () => ({
        getOrCreateAndAddUserChat: mocks.getOrCreateAndAddUserChat,
      }),
    },
  ),
}));

vi.mock('@/api/playIntents', () => ({
  playIntentsApi: {
    addProposalMember: vi.fn(),
    removeProposalMember: vi.fn(),
    confirmProposal: mocks.confirmProposal,
    declineProposal: mocks.declineProposal,
    discussGroup: mocks.discussGroup,
  },
}));

vi.mock('@/api', () => ({
  gamesApi: {
    join: mocks.joinGame,
  },
}));

vi.mock('@/utils/runWithProfileName', () => ({
  runWithProfileName: (fn: () => void) => fn(),
}));

vi.mock('@/utils/genderJoinGate', () => ({
  runWithGenderForEvent: () => true,
  recoverGenderUnsetJoin: () => false,
}));

vi.mock('@/utils/gameSlotOverlapConfirm', () => ({
  runWithOverlapConfirm: async (
    action: (confirmOverlap: boolean) => Promise<unknown>,
  ) => action(false),
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

const matchingGame: MatchingLobbyGame = {
  id: 'game-open',
  entityType: 'GAME',
  allowDirectJoin: true,
  genderTeams: 'ANY',
  startTime: '2026-07-30T16:00:00.000Z',
  timeLabel: '18:00',
  club: { id: 'club-1', name: 'Club' },
  maxParticipants: 4,
  playingCount: 2,
  playingAvatars: [],
  ownerAvatar: null,
};

const queueGame: MatchingLobbyGame = {
  ...matchingGame,
  id: 'game-queue',
  allowDirectJoin: false,
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
  inGame: false,
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

  it('closes a stale proposal with a clear localized message', async () => {
    mocks.confirmProposal.mockRejectedValueOnce({
      response: { data: { code: 'playIntent.proposalUnavailable' } },
    });
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');

    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={4}
          sport="PADEL"
          proposal={proposal}
          onChanged={mocks.onChanged}
        />,
      );
    });

    const createGame = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'playIntent.createGame',
    );
    await act(async () => {
      createGame?.click();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      'playIntent.proposalUnavailable',
    );
    expect(mocks.onChanged).toHaveBeenCalled();
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
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
    expect(container.textContent).toContain('playIntent.matchReadyTitle');
    expect(container.textContent).toContain('playIntent.matchReadyHint');
    const progress = container.querySelector('[data-testid="play-intent-cluster-progress"]');
    const roster = container.querySelector('[data-testid="ready-roster"]');
    expect(progress?.getAttribute('data-current')).toBe('4');
    expect(progress?.getAttribute('data-needed')).toBe('4');
    expect(
      progress?.compareDocumentPosition(roster as Node) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      createGame?.click();
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      '/create-game',
      expect.objectContaining({
        state: expect.objectContaining({
          entityType: 'GAME',
          invitedPlayerIds: ['two', 'three', 'four'],
          playIntentSource: {
            type: 'DIRECT',
            hostIntentId: 'intent-viewer',
            invitees: [
              { userId: 'two', intentId: 'intent-two' },
              { userId: 'three', intentId: 'intent-three' },
              { userId: 'four', intentId: 'intent-four' },
            ],
          },
          playIntentRosterLevels: [3, 3, 3],
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
    expect(container.textContent).toContain('playIntent.matchNotReadyTitle');
    expect(mocks.t).toHaveBeenCalledWith('playIntent.matchNotReadyHint', { count: 2 });
    const court = container.querySelector('[data-testid="court-selection"]');
    expect(court?.getAttribute('data-selected-player-ids')).toBe('two');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-remove-player="two"]')?.click();
    });

    expect(roster?.getAttribute('data-player-ids')).toBe('viewer');
    expect(roster?.getAttribute('data-empty-slots')).toBe('3');
    expect(mocks.t).toHaveBeenCalledWith('playIntent.matchNotReadyHint', { count: 3 });
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
          playIntentSource: {
            type: 'DIRECT',
            hostIntentId: 'intent-viewer',
            invitees: [],
          },
        }),
      }),
    );
  });

  it('counts a tapped compatible player outside the auto-picked best three', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    const members = [
      ...freeMembers,
      {
        ...freeMembers[0],
        userId: 'five',
        intentId: 'intent-five',
        firstName: 'five',
        affinity: 'mid' as const,
        affinityScore: 1,
      },
    ];

    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={members}
          overflow={0}
          partySize={4}
          availableCount={4}
          clusterProgress={4}
          sport="PADEL"
          intent={intent}
          proposal={null}
          onChanged={mocks.onChanged}
        />,
      );
    });

    const roster = container.querySelector('[data-testid="ready-roster"]');
    const court = container.querySelector('[data-testid="court-selection"]');
    expect(roster?.getAttribute('data-player-ids')).toBe('viewer,two,three,four');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-remove-player="four"]')?.click();
    });

    expect(roster?.getAttribute('data-empty-slots')).toBe('1');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-pool-member="five"]')?.click();
    });

    expect(court?.getAttribute('data-selected-player-ids')).toBe('two,three,five');
    expect(roster?.getAttribute('data-player-ids')).toBe('viewer,two,three,five');
    expect(roster?.getAttribute('data-empty-slots')).toBe('0');
  });

  it('opens a user chat when discussing with one other selected player', async () => {
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

    const discuss = container.querySelector<HTMLButtonElement>(
      '[data-testid="lobby-discuss"]',
    );
    expect(discuss).not.toBeNull();

    await act(async () => {
      discuss?.click();
      await Promise.resolve();
    });

    expect(mocks.getOrCreateAndAddUserChat).toHaveBeenCalledWith('two');
    expect(mocks.discussGroup).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/user-chat/chat-1',
      expect.objectContaining({
        state: expect.objectContaining({ contextType: 'USER' }),
      }),
    );
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens or creates an exact-member group when discussing with several players', async () => {
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

    expect(container.textContent).toContain('playIntent.discussInGroup');
    const discuss = container.querySelector<HTMLButtonElement>(
      '[data-testid="lobby-discuss"]',
    );
    expect(
      container.querySelector('[data-testid="match-editor"]')?.contains(discuss),
    ).toBe(true);

    await act(async () => {
      discuss?.click();
      await Promise.resolve();
    });

    expect(mocks.discussGroup).toHaveBeenCalledWith(['two', 'three', 'four']);
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/group-chat/group-1',
      expect.objectContaining({
        state: expect.objectContaining({ contextType: 'GROUP' }),
      }),
    );
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('refreshes the lobby when discuss rejects a player who left', async () => {
    mocks.discussGroup.mockRejectedValueOnce({
      response: { data: { code: 'playIntent.discussNotInLobby' } },
    });
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

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="lobby-discuss"]')?.click();
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.onChanged).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });

  it('hides discuss when the roster is only the viewer', async () => {
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

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-remove-player="two"]')?.click();
    });

    expect(container.querySelector('[data-testid="lobby-discuss"]')).toBeNull();
    expect(container.textContent).toContain('playIntent.createGame');
  });

  it('shows matching games on an otherwise empty looking lobby', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
          sport="PADEL"
          intent={intent}
          matchingGames={[matchingGame]}
          onChanged={mocks.onChanged}
        />,
      );
    });

    expect(container.querySelector('[data-testid="court-selection"]')).not.toBeNull();
    expect(
      container.querySelector('[data-matching-game="game-open"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('playIntent.emptyPool');
  });

  it('hides matching games for spectators and open proposals', async () => {
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={freeMembers}
          overflow={0}
          partySize={4}
          availableCount={1}
          clusterProgress={2}
          sport="PADEL"
          matchingGames={[matchingGame]}
          onChanged={mocks.onChanged}
        />,
      );
    });
    expect(container.querySelector('[data-matching-game]')).toBeNull();

    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={freeMembers}
          overflow={0}
          partySize={4}
          availableCount={1}
          clusterProgress={2}
          sport="PADEL"
          intent={intent}
          proposal={proposal}
          matchingGames={[matchingGame]}
          onChanged={mocks.onChanged}
        />,
      );
    });
    expect(container.querySelector('[data-matching-game]')).toBeNull();
  });

  it('joins a direct-match game and closes the lobby', async () => {
    mocks.joinGame.mockResolvedValueOnce({
      message: 'games.joinedSuccessfully',
    });
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
          sport="PADEL"
          intent={intent}
          matchingGames={[matchingGame]}
          onChanged={mocks.onChanged}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-matching-game="game-open"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.joinGame).toHaveBeenCalledWith('game-open', false);
    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.navigate).toHaveBeenCalledWith('/games/game-open');
  });

  it('keeps looking after asking to join a queue-only game', async () => {
    mocks.joinGame.mockResolvedValueOnce({
      message: 'games.addedToJoinQueue',
    });
    const { CourtLobbyPanel } = await import('./CourtLobbySheet');
    await act(async () => {
      root.render(
        <CourtLobbyPanel
          open
          onOpenChange={mocks.onOpenChange}
          members={[]}
          overflow={0}
          partySize={4}
          availableCount={0}
          clusterProgress={1}
          sport="PADEL"
          intent={intent}
          matchingGames={[queueGame]}
          onChanged={mocks.onChanged}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-matching-game="game-queue"]')
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.joinGame).toHaveBeenCalledWith('game-queue', false);
    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.onChanged).toHaveBeenCalled();
  });
});
