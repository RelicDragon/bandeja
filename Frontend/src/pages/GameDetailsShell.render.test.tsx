// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useShellNavStore } from '@/store/shellNavStore';
import type { Game } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const probes = vi.hoisted(() => ({ getById: vi.fn(), info: vi.fn(), skeleton: vi.fn(), t: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: probes.t }) }));
vi.mock('@/api', () => ({
  gamesApi: { getById: probes.getById },
  invitesApi: {}, courtsApi: {}, clubsApi: {},
  normalizeGameFromApi: (game: Game) => game,
}));
vi.mock('@/api/favorites', () => ({ favoritesApi: {} }));
vi.mock('@/api/results', () => ({ resultsApi: {} }));
vi.mock('@/api/training', () => ({ trainingApi: {} }));
vi.mock('@/api/faq', () => ({ faqApi: {} }));
vi.mock('@/utils/cacheUtils', () => ({ clearCachesExceptUnsyncedResults: vi.fn() }));
vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: null })) };
});
vi.mock('@/store/socketEventsStore', async () => {
  const { create } = await import('zustand');
  return { useSocketEventsStore: create(() => ({
    lastGameUpdate: null, lastGameTextInvalidate: null, lastGameCancelled: null,
    lastInviteDeleted: null, clearLastGameCancelled: vi.fn(),
  })) };
});
vi.mock('@/services/gameRoomMembership', () => ({ retainGameRoom: vi.fn().mockResolvedValue(undefined), releaseGameRoom: vi.fn() }));
vi.mock('@/services/leagueResultsEngineSession', () => ({ releaseAnyLeagueResultsEngine: vi.fn() }));
vi.mock('@/services/gameResultsEngine', async () => {
  const { create } = await import('zustand');
  return { useGameResultsStore: create(() => ({ rounds: [], canEdit: false })), GameResultsEngine: {} };
});
vi.mock('@/hooks/useDeclineInvite', () => ({ useDeclineInvite: () => ({ declineInviteModal: null }) }));
vi.mock('@/hooks/usePlatformFlags', () => ({ usePlatformFlags: () => ({ isEnabled: () => false }) }));
vi.mock('@/hooks/useIsLandscape', () => ({ useIsLandscape: () => false }));
vi.mock('@/features/attendance/useGameAttendance', () => ({ useGameAttendance: () => ({}) }));
vi.mock('@/components', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  GameInfo: ({ game }: { game: Game }) => { probes.info(game); return <div data-testid="game-info">{game.name}</div>; },
  GameParticipants: () => null, GameSettings: () => null, PlayerListModal: () => null,
  ManageUsersModal: () => null, CourtModal: () => null, MultipleCourtsSelector: () => null,
  LeagueScheduleTab: () => null, LeaguePlannerTab: () => null, LeagueStandingsTab: () => null,
  ConfirmationModal: () => null, SegmentedSwitch: () => null,
}));
vi.mock('@/components/RefreshIndicator', () => ({ RefreshIndicator: () => null }));
vi.mock('@/components/GameDetails/DeleteGameBookingsWarningModal', () => ({ DeleteGameBookingsWarningModal: () => null }));
vi.mock('@/components/GameDetails/GameCancelled', () => ({ GameCancelled: () => null }));
vi.mock('@/components/GameDetails/GameDetailsSkeleton', () => ({ GameDetailsSkeleton: () => { probes.skeleton(); return <div>Loading</div>; } }));
vi.mock('@/components/GameDetails/GameActionCard', () => ({ GameActionCard: () => null }));
vi.mock('@/components/GameDetails/PlayWithGroupAgainButton', () => ({ PlayWithGroupAgainButton: () => null }));
vi.mock('@/components/GameDetails/PhotosSection', () => ({ PhotosSection: () => null }));
vi.mock('@/components/GameDetails/GameWebCamerasSection', () => ({ GameWebCamerasSection: () => null }));
vi.mock('@/components/GameDetails/ResultsRosterCard', () => ({ ResultsRosterCard: () => null }));
vi.mock('@/components/GameDetails/BarParticipantsList', () => ({ BarParticipantsList: () => null }));
vi.mock('@/components/GameDetails/LeagueFixedTeamsSection', () => ({ LeagueFixedTeamsSection: () => null }));
vi.mock('@/components/GameDetails/FixedTeamsManagement', () => ({ FixedTeamsManagement: () => null }));
vi.mock('@/components/GameDetails/GameFormatSection', () => ({ GameFormatSection: () => null }));
vi.mock('@/components/GameDetails/LeagueSeasonPointsSection', () => ({ LeagueSeasonPointsSection: () => null }));
vi.mock('@/components/GameDetails/FaqTab', () => ({ FaqTab: () => null }));
vi.mock('@/components/GameDetails/FaqEdit', () => ({ FaqEdit: () => null }));
vi.mock('@/components/GameDetails/EditGameInfoModal', () => ({ EditGameInfoModal: () => null }));
vi.mock('@/components/weather/WeatherRiskBanner', () => ({ WeatherRiskBanner: () => null }));
vi.mock('@/components/GameDetails/GameResultsEntryEmbedded', () => ({ GameResultsEntryEmbedded: () => null }));
vi.mock('@/components/GameDetails/LiveWatchBlock', () => ({ LiveWatchBlock: () => null }));
vi.mock('@/components/GameDetails/GameResultsShowInStoriesSwitch', () => ({ GameResultsShowInStoriesSwitch: () => null }));
vi.mock('@/components/gameResults/ResultsTableView', () => ({ ResultsTableView: () => null }));
vi.mock('@/components/gameResults', () => ({ ScoreEntryModal: () => null, RoundAddedModal: () => null }));
vi.mock('@/components/GameDetails/TrainingResultsSection', () => ({ TrainingResultsSection: () => null }));
vi.mock('@/components/GameDetails/PublicGamePrompt', () => ({ PublicGamePrompt: () => null }));
vi.mock('@/components/GameDetails/BetSection', () => ({ BetSection: () => null }));
vi.mock('@/components/GameDetails/ParticipantsOnlyChatSection', () => ({ ParticipantsOnlyChatSection: () => null }));
vi.mock('@/components/GameDetails/GameLinkedBookingsSection', () => ({ GameLinkedBookingsSection: () => null }));
vi.mock('@/components/GameDetails/cost/GameCostCard', () => ({ GameCostCard: () => null }));
vi.mock('@/features/game-series/SeriesGameSection', () => ({ SeriesGameSection: () => null }));
vi.mock('@/features/game-series/SeriesTitleLine', () => ({ SeriesTitleLine: () => null }));
vi.mock('@/features/attendance/AttendanceCard', () => ({ AttendanceCard: () => null }));
vi.mock('@/features/spot-opened/SpotOpenedGameSection', () => ({ SpotOpenedGameSection: () => null }));
vi.mock('@/features/organizer-next-actions/OrganizerNextActionsSection', () => ({ OrganizerNextActionsSection: () => null }));
vi.mock('@/features/spot-opened/JoinFromDeepLink', () => ({ JoinFromDeepLink: () => null }));
vi.mock('@/features/attendance/AttendanceLegendSheet', () => ({ AttendanceLegendSheet: () => null }));
vi.mock('@/components/motion/AnimatedPresencePanel', () => ({ AnimatedPresencePanel: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/motion/AnimatedChildrenStagger', () => ({ AnimatedChildrenStagger: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/GameDetails/GameDetailsSection', () => ({ GameDetailsSection: () => null }));

import { GameDetailsShell } from './GameDetailsShell';
import { useSocketEventsStore } from '@/store/socketEventsStore';

const game = {
  id: 'game-1', name: 'Game before update', entityType: 'GAME', sport: 'PADEL',
  gameType: 'CLASSIC', status: 'ANNOUNCED', resultsStatus: 'NONE', participants: [],
  maxParticipants: 4, minParticipants: 2, isPublic: true, timeIsSet: false,
  affectsRating: true, allowDirectJoin: true,
} as Game;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  useGameDetailsChromeStore.setState(useGameDetailsChromeStore.getInitialState());
  useShellNavStore.setState(useShellNavStore.getInitialState());
  useSocketEventsStore.setState(useSocketEventsStore.getInitialState());
  probes.getById.mockResolvedValue({ data: game });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function renderShell(initialGame: Game | null = game) {
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/games/game-1']}>
      <Routes><Route path="/games/:id" element={<GameDetailsShell variant="game" initialGame={initialGame} />} /></Routes>
    </MemoryRouter>,
  ));
}
it('renders the bootstrap game immediately without a skeleton or duplicate request', async () => {
  await renderShell();
  expect(container.textContent).toContain(game.name);
  expect(probes.skeleton).not.toHaveBeenCalled();
  expect(probes.getById).not.toHaveBeenCalled();
});
it('does not rerender details for unrelated navigation and chat chrome updates', async () => {
  await renderShell();
  probes.info.mockClear();
  act(() => useShellNavStore.getState().setBounceNotifications(true));
  act(() => useGameDetailsChromeStore.getState().setViewingGameChat('other-game', 'PUBLIC'));
  expect(probes.info).not.toHaveBeenCalled();
});
it('still loads the game when no bootstrap game is provided', async () => {
  await renderShell(null);
  expect(probes.getById).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(game.name);
});
it('keeps the mounted details while applying a live game update', async () => {
  await renderShell();
  const info = container.querySelector('[data-testid="game-info"]');
  act(() => useSocketEventsStore.setState({ lastGameUpdate: {
    gameId: game.id, senderId: 'another-user', game: { ...game, name: 'Updated game' },
  } }));
  expect(container.querySelector('[data-testid="game-info"]')).toBe(info);
  expect(container.textContent).toContain('Updated game');
});

it('does not clear and republish unchanged header tags on a live update', async () => {
  await renderShell();
  const changes = vi.fn();
  const unsubscribe = useGameDetailsChromeStore.subscribe((state, previous) => {
    if (state.gameDetailsSportTag !== previous.gameDetailsSportTag) changes(state.gameDetailsSportTag);
  });
  try {
    act(() => useSocketEventsStore.setState({ lastGameUpdate: {
      gameId: game.id, senderId: 'another-user', game: { ...game, name: 'Updated game' },
    } }));
    expect(changes).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

it('ignores live updates for other games', async () => {
  await renderShell();
  probes.info.mockClear();
  act(() => useSocketEventsStore.setState({ lastGameUpdate: {
    gameId: 'another-game', senderId: 'another-user', game: { ...game, id: 'another-game' },
  } }));
  expect(probes.info).not.toHaveBeenCalled();
});

it('updates the header when its sport or match format actually changes', async () => {
  await renderShell();
  act(() => useSocketEventsStore.setState({ lastGameUpdate: {
    gameId: game.id, senderId: 'another-user', game: { ...game, sport: 'TENNIS', playersPerMatch: 2 },
  } }));
  expect(useGameDetailsChromeStore.getState().gameDetailsSportTag).toMatchObject({ sport: 'TENNIS', playersPerMatch: 2 });
});

it('does not replay a cached socket update over the freshly fetched bootstrap game', async () => {
  useSocketEventsStore.setState({ lastGameUpdate: {
    gameId: game.id, senderId: 'another-user', game: { ...game, name: 'Old cached name' },
  } });
  await renderShell();
  expect(container.textContent).toContain(game.name);
  expect(container.textContent).not.toContain('Old cached name');
});
